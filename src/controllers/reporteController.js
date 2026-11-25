const { pool } = require('../config/db');

function validarFecha(fecha) {
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

async function resumen(req, res) {
  const desde = req.query.desde;
  const hasta = req.query.hasta;
  if (!validarFecha(desde) || !validarFecha(hasta)) {
    return res.status(400).json({ mensaje: 'Indica desde y hasta con formato válido AAAA-MM-DD.' });
  }
  if (desde > hasta) {
    return res.status(400).json({ mensaje: 'La fecha desde no puede ser posterior a la fecha hasta.' });
  }
  const inicio = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  const dias = Math.round((fin - inicio) / 86400000) + 1;
  if (dias > 366) {
    return res.status(400).json({ mensaje: 'El rango de fechas no puede superar los 366 días.' });
  }

  try {
    const [porEstado] = await pool.execute(
      `SELECT estado_cita, COUNT(*) AS cantidad
       FROM cita
       WHERE fecha_cita >= ? AND fecha_cita <= ?
       GROUP BY estado_cita`,
      [desde, hasta]
    );
    const [atendidas] = await pool.execute(
      `SELECT COUNT(*) AS cantidad
       FROM cita
       WHERE fecha_cita >= ? AND fecha_cita <= ? AND estado_cita = ?`,
      [desde, hasta, 'completada']
    );
    const [servicios] = await pool.execute(
      `SELECT s.nombre_servicio, COUNT(d.id_detalle) AS cantidad,
              COALESCE(SUM(d.subtotal), 0) AS subtotal
       FROM cita c
       INNER JOIN detalle_cita d ON d.id_cita = c.id_cita
       INNER JOIN servicio s ON s.id_servicio = d.id_servicio
       WHERE c.fecha_cita >= ? AND c.fecha_cita <= ? AND c.estado_cita = ?
       GROUP BY s.id_servicio, s.nombre_servicio
       ORDER BY cantidad DESC, s.nombre_servicio ASC
       LIMIT 10`,
      [desde, hasta, 'completada']
    );
    const [ingresos] = await pool.execute(
      `SELECT COALESCE(SUM(total), 0) AS total
       FROM cita
       WHERE fecha_cita >= ? AND fecha_cita <= ? AND estado_cita = ?`,
      [desde, hasta, 'completada']
    );
    const [porModalidad] = await pool.execute(
      `SELECT modalidad, COUNT(*) AS cantidad
       FROM cita
       WHERE fecha_cita >= ? AND fecha_cita <= ?
       GROUP BY modalidad`,
      [desde, hasta]
    );
    const [porEspecialista] = await pool.execute(
      `SELECT u.id_usuario, u.nombre, COUNT(c.id_cita) AS cantidad
       FROM cita c
       INNER JOIN usuario u ON u.id_usuario = c.id_especialista
       WHERE c.fecha_cita >= ? AND c.fecha_cita <= ? AND c.estado_cita = ?
       GROUP BY u.id_usuario, u.nombre
       ORDER BY cantidad DESC, u.nombre ASC`,
      [desde, hasta, 'completada']
    );

    const estados = { pendiente: 0, confirmada: 0, completada: 0, cancelada: 0 };
    let totalCitas = 0;
    for (const fila of porEstado) {
      estados[fila.estado_cita] = Number(fila.cantidad);
      totalCitas += Number(fila.cantidad);
    }
    const modalidades = { estudio: 0, domicilio: 0 };
    for (const fila of porModalidad) {
      modalidades[fila.modalidad] = Number(fila.cantidad);
    }

    return res.json({
      desde,
      hasta,
      total_citas: totalCitas,
      total_por_estado: estados,
      citas_atendidas: Number(atendidas[0].cantidad),
      servicios_mas_solicitados: servicios.map((fila) => ({
        nombre: fila.nombre_servicio,
        cantidad: Number(fila.cantidad),
        subtotal: Number(fila.subtotal).toFixed(2)
      })),
      ingresos_estimados: Number(ingresos[0].total).toFixed(2),
      citas_por_modalidad: modalidades,
      citas_por_especialista: porEspecialista.map((fila) => ({
        id_especialista: fila.id_usuario,
        nombre: fila.nombre,
        cantidad: Number(fila.cantidad)
      }))
    });
  } catch (error) {
    console.error('Error al generar el resumen:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible generar el resumen de reportes.' });
  }
}

async function diario(req, res) {
  const fecha = req.query.fecha === undefined ? fechaLocalHoy() : req.query.fecha;
  if (!validarFecha(fecha)) {
    return res.status(400).json({ mensaje: 'Indica una fecha válida con formato AAAA-MM-DD.' });
  }

  try {
    const [porEstado] = await pool.execute(
      `SELECT estado_cita, COUNT(*) AS cantidad
       FROM cita
       WHERE fecha_cita = ?
       GROUP BY estado_cita`,
      [fecha]
    );
    const [atendidas] = await pool.execute(
      `SELECT COUNT(*) AS cantidad
       FROM cita
       WHERE fecha_cita = ? AND estado_cita = ?`,
      [fecha, 'completada']
    );
    const [citas] = await pool.execute(
      `SELECT c.id_cita, c.hora_cita, c.estado_cita,
              cliente.nombre AS nombre_cliente
       FROM cita c
       INNER JOIN usuario cliente ON cliente.id_usuario = c.id_cliente
       WHERE c.fecha_cita = ?
       ORDER BY c.hora_cita ASC, c.id_cita ASC`,
      [fecha]
    );

    const ids = citas.map((cita) => cita.id_cita);
    let serviciosPorCita = new Map();
    if (ids.length > 0) {
      const marcadores = ids.map(() => '?').join(', ');
      const [servicios] = await pool.execute(
        `SELECT d.id_cita, s.nombre_servicio
         FROM detalle_cita d
         INNER JOIN servicio s ON s.id_servicio = d.id_servicio
         WHERE d.id_cita IN (${marcadores})
         ORDER BY d.id_cita, d.id_detalle`,
        ids
      );
      for (const servicio of servicios) {
        if (!serviciosPorCita.has(servicio.id_cita)) {
          serviciosPorCita.set(servicio.id_cita, []);
        }
        serviciosPorCita.get(servicio.id_cita).push(servicio.nombre_servicio);
      }
    }

    const estados = { pendiente: 0, confirmada: 0, completada: 0, cancelada: 0 };
    let totalCitas = 0;
    for (const fila of porEstado) {
      estados[fila.estado_cita] = Number(fila.cantidad);
      totalCitas += Number(fila.cantidad);
    }

    return res.json({
      fecha,
      total_citas: totalCitas,
      total_por_estado: estados,
      citas_atendidas: Number(atendidas[0].cantidad),
      citas: citas.map((cita) => ({
        hora: cita.hora_cita,
        cliente: cita.nombre_cliente,
        servicio: serviciosPorCita.get(cita.id_cita) || [],
        estado: cita.estado_cita
      }))
    });
  } catch (error) {
    console.error('Error al generar el reporte diario:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible generar el reporte diario.' });
  }
}

module.exports = { resumen, diario };
