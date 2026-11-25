const crypto = require('crypto');
const { pool } = require('../config/db');
const {
  validarFechaReserva,
  convertirHoraEnMinutos,
  formatearHora,
  crearFechaHoraLocal,
  calcularHorasDisponibles
} = require('../config/agenda');
const { CIUDADES, HORAS_MIN_CANCELAR } = require('../config/reglas');

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

async function crearCita(req, res) {
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  const idServicios = Array.isArray(datos.id_servicios)
    ? datos.id_servicios.map(validarId)
    : [];
  const idEspecialista = validarId(datos.id_especialista);
  const fecha = datos.fecha_cita;
  const minutosInicio = convertirHoraEnMinutos(datos.hora_cita);
  const modalidad = datos.modalidad;

  if (idServicios.length === 0 || idServicios.some((id) => id === null)) {
    return res.status(400).json({ mensaje: 'Selecciona al menos un servicio válido.' });
  }
  if (!idEspecialista) {
    return res.status(400).json({ mensaje: 'Selecciona un especialista válido.' });
  }
  if (typeof fecha !== 'string') {
    return res.status(400).json({ mensaje: 'Indica una fecha válida para la cita.' });
  }
  const validacionFecha = validarFechaReserva(fecha);
  if (validacionFecha.error) {
    return res.status(400).json({ mensaje: validacionFecha.error });
  }
  if (minutosInicio === null || minutosInicio >= 1440) {
    return res.status(400).json({ mensaje: 'Selecciona una hora de inicio válida.' });
  }
  if (modalidad !== 'estudio' && modalidad !== 'domicilio') {
    return res.status(400).json({ mensaje: 'Selecciona una modalidad válida.' });
  }

  let ciudad = null;
  let direccionServicio = null;
  if (modalidad === 'domicilio') {
    ciudad = datos.ciudad;
    direccionServicio = typeof datos.direccion_servicio === 'string'
      ? datos.direccion_servicio.trim()
      : '';
    if (!CIUDADES.includes(ciudad)) {
      return res.status(400).json({ mensaje: 'Selecciona Otavalo o Ibarra para el servicio a domicilio.' });
    }
    if (direccionServicio.length < 10 || direccionServicio.length > 255) {
      return res.status(400).json({ mensaje: 'La dirección a domicilio debe tener entre 10 y 255 caracteres.' });
    }
  }

  let conexion;
  let transaccionIniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    transaccionIniciada = true;

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
        req.usuario.id_usuario,
        idEspecialista,
        fecha,
        `${horaInicio}:00`,
        horaFin,
        modalidad,
        ciudad,
        direccionServicio,
        'pendiente',
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

    await conexion.commit();
    transaccionIniciada = false;
    return res.status(201).json({
      mensaje: 'La cita se reservó correctamente.',
      cita
    });
  } catch (error) {
    if (transaccionIniciada && conexion) {
      try {
        await conexion.rollback();
      } catch (errorRollback) {
        console.error('Error al revertir la transacción de reserva:', errorRollback.message);
      }
    }
    if (error.estadoHttp) {
      return res.status(error.estadoHttp).json({ mensaje: error.message });
    }
    console.error('Error al crear la cita:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible completar la reserva.' });
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
}

async function obtenerCita(req, res) {
  const idCita = validarId(req.params.id);
  if (!idCita) {
    return res.status(400).json({ mensaje: 'El identificador de la cita no es válido.' });
  }

  try {
    const cita = await obtenerCitaCompleta(pool, idCita);
    if (!cita) {
      return res.status(404).json({ mensaje: 'No se encontró la cita solicitada.' });
    }

    const esCliente = Number(cita.id_cliente) === Number(req.usuario.id_usuario);
    const esEspecialista = Number(cita.id_especialista) === Number(req.usuario.id_usuario);
    const esPersonalAutorizado = ['administrador', 'recepcionista'].includes(req.usuario.rol);
    if (!esCliente && !esEspecialista && !esPersonalAutorizado) {
      return res.status(403).json({ mensaje: 'No tienes permiso para consultar esta cita.' });
    }

    return res.json({ cita });
  } catch (error) {
    console.error('Error al consultar la cita:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener los datos de la cita.' });
  }
}

async function cancelarCita(req, res) {
  const idCita = validarId(req.params.id);
  if (!idCita) {
    return res.status(400).json({ mensaje: 'El identificador de la cita no es válido.' });
  }

  let conexion;
  let transaccionIniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    transaccionIniciada = true;

    const [citas] = await conexion.execute(
      `SELECT id_cita, fecha_cita, hora_cita, estado_cita
       FROM cita
       WHERE id_cita = ? AND id_cliente = ?
       FOR UPDATE`,
      [idCita, req.usuario.id_usuario]
    );
    if (citas.length === 0) {
      throw crearErrorCita(404, 'No se encontró una cita tuya con ese identificador.');
    }

    const cita = citas[0];
    if (cita.estado_cita !== 'pendiente' && cita.estado_cita !== 'confirmada') {
      throw crearErrorCita(400, 'Solo puedes cancelar citas pendientes o confirmadas.');
    }

    const fechaHoraCita = crearFechaHoraLocal(cita.fecha_cita, cita.hora_cita);
    if (!fechaHoraCita) {
      throw new Error('No fue posible interpretar la fecha y hora de la cita.');
    }
    const minutosRestantes = (fechaHoraCita.getTime() - Date.now()) / 60000;
    if (minutosRestantes < HORAS_MIN_CANCELAR * 60) {
      throw crearErrorCita(
        400,
        `La cita solo se puede cancelar con al menos ${HORAS_MIN_CANCELAR} horas de anticipación.`
      );
    }

    await conexion.execute(
      'UPDATE cita SET estado_cita = ? WHERE id_cita = ?',
      ['cancelada', idCita]
    );
    await conexion.commit();
    transaccionIniciada = false;
    return res.json({
      mensaje: 'La cita se canceló correctamente.',
      id_cita: idCita,
      estado_cita: 'cancelada'
    });
  } catch (error) {
    if (transaccionIniciada && conexion) {
      try {
        await conexion.rollback();
      } catch (errorRollback) {
        console.error('Error al revertir la transacción de cancelación:', errorRollback.message);
      }
    }
    if (error.estadoHttp) {
      return res.status(error.estadoHttp).json({ mensaje: error.message });
    }
    console.error('Error al cancelar la cita:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible cancelar la cita.' });
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
}

module.exports = {
  crearCita,
  obtenerCita,
  cancelarCita
};
