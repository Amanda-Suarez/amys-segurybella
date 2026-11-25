const crypto = require('crypto');
const {
  validarFechaReserva,
  convertirHoraEnMinutos,
  formatearHora,
  calcularHorasDisponibles
} = require('../config/agenda');
const { CIUDADES } = require('../config/reglas');

const mensajeHorarioOcupado = 'Ese horario ya no está disponible, elige otro';

function validarId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function crearErrorCita(estado, mensaje) {
  const error = new Error(mensaje);
  error.estadoHttp = estado;
  return error;
}

function precioEnCentavos(precio) {
  const coincidencia = String(precio).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!coincidencia) {
    throw new Error('El precio de un servicio no tiene un formato válido.');
  }
  return Number(coincidencia[1]) * 100 + Number((coincidencia[2] || '').padEnd(2, '0'));
}

function dineroDesdeCentavos(centavos) {
  return (centavos / 100).toFixed(2);
}

async function obtenerCitaCompleta(conexion, idCita) {
  const [citas] = await conexion.execute(
    `SELECT c.id_cita, c.id_cliente, c.id_especialista, c.fecha_cita,
            c.hora_cita, c.hora_fin, c.modalidad, c.ciudad,
            c.direccion_servicio, c.estado_cita, c.codigo_comprobante,
            c.total, c.fecha_creacion,
            cliente.nombre AS nombre_cliente,
            especialista.nombre AS nombre_especialista
     FROM cita c
     INNER JOIN usuario cliente ON cliente.id_usuario = c.id_cliente
     INNER JOIN usuario especialista ON especialista.id_usuario = c.id_especialista
     WHERE c.id_cita = ?
     LIMIT 1`,
    [idCita]
  );
  if (citas.length === 0) {
    return null;
  }

  const [servicios] = await conexion.execute(
    `SELECT d.id_servicio, s.nombre_servicio, s.precio,
            s.duracion_minutos, d.subtotal
     FROM detalle_cita d
     INNER JOIN servicio s ON s.id_servicio = d.id_servicio
     WHERE d.id_cita = ?
     ORDER BY d.id_detalle`,
    [idCita]
  );

  return {
    ...citas[0],
    servicios
  };
}

async function crearCitaEnTransaccion(conexion, datos, idCliente, estadoInicial) {
  const idServicios = Array.isArray(datos.id_servicios)
    ? datos.id_servicios.map(validarId)
    : [];
  const idEspecialista = validarId(datos.id_especialista);
  const fecha = datos.fecha_cita;
  const minutosInicio = convertirHoraEnMinutos(datos.hora_cita);
  const modalidad = datos.modalidad;

  if (idServicios.length === 0 || idServicios.some((id) => id === null)) {
    throw crearErrorCita(400, 'Selecciona al menos un servicio válido.');
  }
  if (!idEspecialista) {
    throw crearErrorCita(400, 'Selecciona un especialista válido.');
  }
  if (typeof fecha !== 'string') {
    throw crearErrorCita(400, 'Indica una fecha válida para la cita.');
  }
  const validacionFecha = validarFechaReserva(fecha);
  if (validacionFecha.error) {
    throw crearErrorCita(400, validacionFecha.error);
  }
  if (minutosInicio === null || minutosInicio >= 1440) {
    throw crearErrorCita(400, 'Selecciona una hora de inicio válida.');
  }
  if (modalidad !== 'estudio' && modalidad !== 'domicilio') {
    throw crearErrorCita(400, 'Selecciona una modalidad válida.');
  }

  let ciudad = null;
  let direccionServicio = null;
  if (modalidad === 'domicilio') {
    ciudad = datos.ciudad;
    direccionServicio = typeof datos.direccion_servicio === 'string'
      ? datos.direccion_servicio.trim()
      : '';
    if (!CIUDADES.includes(ciudad)) {
      throw crearErrorCita(400, 'Selecciona Otavalo o Ibarra para el servicio a domicilio.');
    }
    if (direccionServicio.length < 10 || direccionServicio.length > 255) {
      throw crearErrorCita(400, 'La dirección a domicilio debe tener entre 10 y 255 caracteres.');
    }
  }

  const [especialistas] = await conexion.execute(
    `SELECT id_usuario
     FROM usuario
     WHERE id_usuario = ? AND rol = ? AND estado = ?
     FOR UPDATE`,
    [idEspecialista, 'especialista', 'ACTIVO']
  );
  if (especialistas.length === 0) {
    throw crearErrorCita(400, 'El especialista seleccionado no está activo.');
  }

  const idsUnicos = Array.from(new Set(idServicios));
  const marcadores = idsUnicos.map(() => '?').join(', ');
  const [serviciosEncontrados] = await conexion.execute(
    `SELECT id_servicio, nombre_servicio, precio, duracion_minutos
     FROM servicio
     WHERE id_servicio IN (${marcadores}) AND estado = ?`,
    [...idsUnicos, 'ACTIVO']
  );
  const serviciosPorId = new Map(
    serviciosEncontrados.map((servicio) => [Number(servicio.id_servicio), servicio])
  );
  if (serviciosPorId.size !== idsUnicos.length) {
    throw crearErrorCita(400, 'Uno o más servicios ya no están disponibles.');
  }
  const serviciosSeleccionados = idServicios.map((id) => serviciosPorId.get(id));
  const duracionTotal = serviciosSeleccionados.reduce(
    (total, servicio) => total + Number(servicio.duracion_minutos),
    0
  );
  const totalCentavos = serviciosSeleccionados.reduce(
    (total, servicio) => total + precioEnCentavos(servicio.precio),
    0
  );
  if (!Number.isInteger(duracionTotal) || duracionTotal <= 0) {
    throw crearErrorCita(400, 'La duración de los servicios seleccionados no es válida.');
  }
  if (totalCentavos <= 0 || totalCentavos > 99999999) {
    throw crearErrorCita(400, 'El total de la cita supera el valor permitido.');
  }

  const horaInicio = formatearHora(minutosInicio);
  const horasDisponibles = await calcularHorasDisponibles(conexion, {
    idEspecialista,
    fecha,
    duracion: duracionTotal,
    modalidad
  });
  if (!horasDisponibles.includes(horaInicio)) {
    throw crearErrorCita(409, mensajeHorarioOcupado);
  }

  const horaFin = `${formatearHora(minutosInicio + duracionTotal)}:00`;
  const codigoTemporal = `TMP-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
  const [resultadoCita] = await conexion.execute(
    `INSERT INTO cita
      (id_cliente, id_especialista, fecha_cita, hora_cita, hora_fin,
       modalidad, ciudad, direccion_servicio, estado_cita,
       codigo_comprobante, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      idCliente,
      idEspecialista,
      fecha,
      `${horaInicio}:00`,
      horaFin,
      modalidad,
      ciudad,
      direccionServicio,
      estadoInicial,
      codigoTemporal,
      dineroDesdeCentavos(totalCentavos)
    ]
  );
  const idCita = resultadoCita.insertId;

  for (const servicio of serviciosSeleccionados) {
    await conexion.execute(
      `INSERT INTO detalle_cita (id_cita, id_servicio, subtotal)
       VALUES (?, ?, ?)`,
      [idCita, servicio.id_servicio, dineroDesdeCentavos(precioEnCentavos(servicio.precio))]
    );
  }

  const [fechasCreacion] = await conexion.execute(
    `SELECT DATE_FORMAT(fecha_creacion, '%Y%m%d') AS fecha_codigo
     FROM cita
     WHERE id_cita = ?
     LIMIT 1`,
    [idCita]
  );
  if (fechasCreacion.length === 0 || !fechasCreacion[0].fecha_codigo) {
    throw new Error('No fue posible obtener la fecha de creación de la cita.');
  }
  const codigoComprobante = `ASB-${fechasCreacion[0].fecha_codigo}-${String(idCita).padStart(4, '0')}`;
  await conexion.execute(
    'UPDATE cita SET codigo_comprobante = ? WHERE id_cita = ?',
    [codigoComprobante, idCita]
  );

  const cita = await obtenerCitaCompleta(conexion, idCita);
  if (!cita) {
    throw new Error('No fue posible recuperar los datos de la cita creada.');
  }
  return cita;
}

module.exports = {
  crearCitaEnTransaccion,
  obtenerCitaCompleta
};
