const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { crearCitaEnTransaccion } = require('../services/citaService');
const { crearFechaHoraLocal } = require('../config/agenda');

const estadosValidos = ['pendiente', 'confirmada', 'completada', 'cancelada'];

function validarId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validarFechaTexto(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }
  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(fechaUtc.getTime()) && fechaUtc.toISOString().slice(0, 10) === fecha;
}

function fechaLocalHoy() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
}

function crearErrorAgenda(estado, mensaje) {
  const error = new Error(mensaje);
  error.estadoHttp = estado;
  return error;
}

async function obtenerNombresServicios(conexion, citas) {
  if (citas.length === 0) {
    return new Map();
  }

  const marcadores = citas.map(() => '?').join(', ');
  const [detalles] = await conexion.execute(
    `SELECT d.id_cita, s.nombre_servicio
     FROM detalle_cita d
     INNER JOIN servicio s ON s.id_servicio = d.id_servicio
     WHERE d.id_cita IN (${marcadores})
     ORDER BY d.id_cita, d.id_detalle`,
    citas.map((cita) => cita.id_cita)
  );

  const serviciosPorCita = new Map();
  for (const detalle of detalles) {
    if (!serviciosPorCita.has(detalle.id_cita)) {
      serviciosPorCita.set(detalle.id_cita, []);
    }
    serviciosPorCita.get(detalle.id_cita).push(detalle.nombre_servicio);
  }
  return serviciosPorCita;
}

async function listarMisCitas(req, res) {
  try {
    const [citas] = await pool.execute(
      `SELECT c.id_cita, c.codigo_comprobante, c.fecha_cita, c.hora_cita,
              c.hora_fin, c.modalidad, c.ciudad, c.direccion_servicio,
              c.estado_cita, c.total,
              especialista.nombre AS nombre_especialista
       FROM cita c
       INNER JOIN usuario especialista ON especialista.id_usuario = c.id_especialista
       WHERE c.id_cliente = ?
       ORDER BY c.fecha_cita DESC, c.hora_cita DESC`,
      [req.usuario.id_usuario]
    );

    const serviciosPorCita = await obtenerNombresServicios(pool, citas);
    return res.json({
      citas: citas.map((cita) => ({
        id_cita: cita.id_cita,
        codigo: cita.codigo_comprobante,
        codigo_comprobante: cita.codigo_comprobante,
        fecha: cita.fecha_cita,
        hora: cita.hora_cita,
        hora_fin: cita.hora_fin,
        modalidad: cita.modalidad,
        ciudad: cita.ciudad,
        direccion: cita.modalidad === 'domicilio' ? cita.direccion_servicio : null,
        estado: cita.estado_cita,
        total: cita.total,
        especialista: cita.nombre_especialista,
         estado_cita: cita.estado_cita,
         servicios: serviciosPorCita.get(cita.id_cita) || []
      }))
    });
  } catch (error) {
    console.error('Error al listar las citas del cliente:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener tus citas.' });
  }
}

async function listarAgenda(req, res) {
  const filtros = [];
  const parametros = [];

  if (req.query.fecha !== undefined) {
    if (!validarFechaTexto(req.query.fecha)) {
      return res.status(400).json({ mensaje: 'Ingresa una fecha válida con formato AAAA-MM-DD.' });
    }
    filtros.push('c.fecha_cita = ?');
    parametros.push(req.query.fecha);
  }

  if (req.query.desde !== undefined) {
    if (!validarFechaTexto(req.query.desde)) {
      return res.status(400).json({ mensaje: 'Ingresa una fecha válida en desde con formato AAAA-MM-DD.' });
    }
    filtros.push('c.fecha_cita >= ?');
    parametros.push(req.query.desde);
  }

  if (req.query.hasta !== undefined) {
    if (!validarFechaTexto(req.query.hasta)) {
      return res.status(400).json({ mensaje: 'Ingresa una fecha válida en hasta con formato AAAA-MM-DD.' });
    }
    filtros.push('c.fecha_cita <= ?');
    parametros.push(req.query.hasta);
  }

  if (
    req.query.desde !== undefined
    && req.query.hasta !== undefined
    && req.query.desde > req.query.hasta
  ) {
    return res.status(400).json({ mensaje: 'La fecha desde no puede ser posterior a la fecha hasta.' });
  }

  if (req.query.estado !== undefined) {
    if (!estadosValidos.includes(req.query.estado)) {
      return res.status(400).json({ mensaje: 'El estado solicitado no es válido.' });
    }
    filtros.push('c.estado_cita = ?');
    parametros.push(req.query.estado);
  }

  if (req.usuario.rol === 'especialista') {
    filtros.push('c.id_especialista = ?');
    parametros.push(req.usuario.id_usuario);
  } else if (req.query.id_especialista !== undefined) {
    const idEspecialista = validarId(req.query.id_especialista);
    if (!idEspecialista) {
      return res.status(400).json({ mensaje: 'El identificador del especialista no es válido.' });
    }
    filtros.push('c.id_especialista = ?');
    parametros.push(idEspecialista);
  }

  const condicion = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

  try {
    const [citas] = await pool.execute(
      `SELECT c.id_cita, c.codigo_comprobante, c.fecha_cita, c.hora_cita,
              c.hora_fin, c.modalidad, c.ciudad, c.direccion_servicio,
              c.estado_cita, c.total,
              cliente.nombre AS nombre_cliente,
              cliente.telefono AS telefono_cliente,
              especialista.nombre AS nombre_especialista
       FROM cita c
       INNER JOIN usuario cliente ON cliente.id_usuario = c.id_cliente
       INNER JOIN usuario especialista ON especialista.id_usuario = c.id_especialista
       ${condicion}
       ORDER BY c.fecha_cita ASC, c.hora_cita ASC, c.id_cita ASC`,
      parametros
    );

    const serviciosPorCita = await obtenerNombresServicios(pool, citas);
    return res.json({
      citas: citas.map((cita) => ({
        id_cita: cita.id_cita,
        codigo: cita.codigo_comprobante,
        codigo_comprobante: cita.codigo_comprobante,
        fecha: cita.fecha_cita,
        hora: cita.hora_cita,
        hora_fin: cita.hora_fin,
        cliente: {
          nombre: cita.nombre_cliente,
          telefono: cita.telefono_cliente
        },
        servicios: serviciosPorCita.get(cita.id_cita) || [],
        modalidad: cita.modalidad,
        ciudad: cita.ciudad,
        direccion: cita.modalidad === 'domicilio' ? cita.direccion_servicio : null,
        especialista: cita.nombre_especialista,
        estado: cita.estado_cita,
        estado_cita: cita.estado_cita,
        total: cita.total
      }))
    });
  } catch (error) {
    console.error('Error al listar la agenda:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener la agenda.' });
  }
}

async function cambiarEstado(req, res) {
  const idCita = validarId(req.params.id);
  if (!idCita) {
    return res.status(400).json({ mensaje: 'El identificador de la cita no es válido.' });
  }

  const nuevoEstado = req.body && typeof req.body === 'object'
    ? (req.body.estado || req.body.estado_cita)
    : undefined;
  if (typeof nuevoEstado !== 'string' || !estadosValidos.includes(nuevoEstado)) {
    return res.status(400).json({ mensaje: 'El nuevo estado no es válido.' });
  }

  let conexion;
  let transaccionIniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    transaccionIniciada = true;

    const [citas] = await conexion.execute(
      `SELECT id_cita, id_especialista, fecha_cita, hora_cita, estado_cita
       FROM cita
       WHERE id_cita = ?
       FOR UPDATE`,
      [idCita]
    );
    if (citas.length === 0) {
      throw crearErrorAgenda(404, 'No se encontró la cita solicitada.');
    }

    const cita = citas[0];
    if (
      req.usuario.rol === 'especialista'
      && Number(cita.id_especialista) !== Number(req.usuario.id_usuario)
    ) {
      throw crearErrorAgenda(403, 'Solo puedes cambiar el estado de tus citas asignadas.');
    }

    if (cita.estado_cita === 'completada' || cita.estado_cita === 'cancelada') {
      throw crearErrorAgenda(400, `La cita está ${cita.estado_cita} y su estado ya es final.`);
    }

    let transicionValida = false;
    if (cita.estado_cita === 'pendiente') {
      transicionValida = nuevoEstado === 'confirmada' || nuevoEstado === 'cancelada';
    } else if (cita.estado_cita === 'confirmada') {
      transicionValida = nuevoEstado === 'completada' || nuevoEstado === 'cancelada';
    }
    if (!transicionValida) {
      throw crearErrorAgenda(
        400,
        `No se puede cambiar una cita ${cita.estado_cita} a ${nuevoEstado}.`
      );
    }

    if (nuevoEstado === 'completada') {
      const fechaHoraCita = crearFechaHoraLocal(cita.fecha_cita, cita.hora_cita);
      if (!fechaHoraCita) {
        throw new Error('No fue posible interpretar la fecha y hora de la cita.');
      }
      if (fechaHoraCita.getTime() > Date.now()) {
        throw crearErrorAgenda(
          400,
          'No puedes completar una cita cuya fecha y hora de inicio todavía no llegó.'
        );
      }
    }

    await conexion.execute(
      'UPDATE cita SET estado_cita = ? WHERE id_cita = ?',
      [nuevoEstado, idCita]
    );
    await conexion.commit();
    transaccionIniciada = false;
    return res.json({
      mensaje: 'El estado de la cita se actualizó correctamente.',
      id_cita: idCita,
      estado: nuevoEstado,
      estado_cita: nuevoEstado
    });
  } catch (error) {
    if (transaccionIniciada && conexion) {
      try {
        await conexion.rollback();
      } catch (errorRollback) {
        console.error('Error al revertir el cambio de estado:', errorRollback.message);
      }
    }
    if (error.estadoHttp) {
      return res.status(error.estadoHttp).json({ mensaje: error.message });
    }
    console.error('Error al cambiar el estado de la cita:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible actualizar el estado de la cita.' });
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
}

async function crearCitaManual(req, res) {
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  const telefono = typeof datos.telefono === 'string' ? datos.telefono.trim() : '';
  const correo = typeof datos.correo === 'string' ? datos.correo.trim().toLowerCase() : '';
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

  if (!nombre || nombre.length > 150) {
    return res.status(400).json({ mensaje: 'Ingresa un nombre válido para el cliente.' });
  }
  if (!telefono || telefono.length > 20) {
    return res.status(400).json({ mensaje: 'Ingresa un teléfono válido para el cliente.' });
  }
  if (!correoValido || correo.length > 150) {
    return res.status(400).json({ mensaje: 'Ingresa un correo válido para el cliente.' });
  }

  let conexion;
  let transaccionIniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    transaccionIniciada = true;

    const [usuarios] = await conexion.execute(
      `SELECT id_usuario, rol, estado
       FROM usuario
       WHERE correo = ?
       LIMIT 1
       FOR UPDATE`,
      [correo]
    );

    let idCliente;
    if (usuarios.length > 0) {
      if (usuarios[0].rol !== 'cliente') {
        throw crearErrorAgenda(409, 'El correo pertenece a una cuenta que no tiene rol cliente.');
      }
      idCliente = usuarios[0].id_usuario;
    } else {
      const contraseniaTemporal = crypto.randomBytes(24).toString('hex');
      const hash = await bcrypt.hash(contraseniaTemporal, 10);
      const [resultado] = await conexion.execute(
        `INSERT INTO usuario
          (nombre, correo, contrasenia, telefono, direccion, rol, estado)
         VALUES (?, ?, ?, ?, NULL, 'cliente', 'ACTIVO')`,
        [nombre, correo, hash, telefono]
      );
      idCliente = resultado.insertId;
    }

    const cita = await crearCitaEnTransaccion(
      conexion,
      datos,
      idCliente,
      'confirmada'
    );
    await conexion.commit();
    transaccionIniciada = false;
    return res.status(201).json({
      mensaje: 'La cita manual se creó correctamente.',
      cita
    });
  } catch (error) {
    if (transaccionIniciada && conexion) {
      try {
        await conexion.rollback();
      } catch (errorRollback) {
        console.error('Error al revertir la cita manual:', errorRollback.message);
      }
    }
    if (error.estadoHttp) {
      return res.status(error.estadoHttp).json({ mensaje: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo.' });
    }
    console.error('Error al crear una cita manual:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible crear la cita manual.' });
  } finally {
    if (conexion) {
      conexion.release();
    }
  }
}

async function resumenHoy(req, res) {
  const hoy = fechaLocalHoy();
  try {
    const [filas] = await pool.execute(
      `SELECT estado_cita, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total_estado
       FROM cita
       WHERE fecha_cita = ?
       GROUP BY estado_cita`,
      [hoy]
    );

    const conteo = {
      pendiente: 0,
      confirmada: 0,
      completada: 0,
      cancelada: 0
    };
    let totalCitas = 0;
    let totalDia = 0;
    for (const fila of filas) {
      const cantidad = Number(fila.cantidad);
      conteo[fila.estado_cita] = cantidad;
      totalCitas += cantidad;
      totalDia += Number(fila.total_estado);
    }

    return res.json({
      fecha: hoy,
      pendiente: conteo.pendiente,
      confirmada: conteo.confirmada,
      completada: conteo.completada,
      cancelada: conteo.cancelada,
      conteo_por_estado: conteo,
      total_citas: totalCitas,
      total_dia: totalCitas,
      total: totalCitas,
      total_ingresos_dia: totalDia.toFixed(2)
    });
  } catch (error) {
    console.error('Error al obtener el resumen de hoy:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener el resumen del día.' });
  }
}

module.exports = {
  listarMisCitas,
  listarAgenda,
  cambiarEstado,
  crearCitaManual,
  resumenHoy
};
