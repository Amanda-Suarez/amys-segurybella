const { pool } = require('../config/db');
const { calcularHorasDisponibles, validarFechaReserva } = require('../config/agenda');

async function listarEspecialistas(req, res) {
  try {
    const [especialistas] = await pool.execute(
      `SELECT DISTINCT u.id_usuario, u.nombre
       FROM usuario u
       INNER JOIN horario_especialista h ON h.id_especialista = u.id_usuario
       WHERE u.rol = ? AND u.estado = ?
       ORDER BY u.nombre`,
      ['especialista', 'ACTIVO']
    );
    return res.json({ especialistas });
  } catch (error) {
    console.error('Error al listar especialistas disponibles:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener los especialistas.' });
  }
}

async function consultarDisponibilidad(req, res) {
  const idEspecialista = Number(req.query.id_especialista);
  const fecha = req.query.fecha;
  const duracion = Number(req.query.duracion);
  const modalidad = req.query.modalidad;

  if (!Number.isInteger(idEspecialista) || idEspecialista <= 0) {
    return res.status(400).json({ mensaje: 'Selecciona un especialista válido.' });
  }
  if (typeof fecha !== 'string') {
    return res.status(400).json({ mensaje: 'Indica una fecha válida para la cita.' });
  }
  const validacionFecha = validarFechaReserva(fecha);
  if (validacionFecha.error) {
    return res.status(400).json({ mensaje: validacionFecha.error });
  }
  if (!Number.isInteger(duracion) || duracion <= 0) {
    return res.status(400).json({ mensaje: 'La duración de la cita debe ser mayor que cero minutos.' });
  }
  if (modalidad !== 'estudio' && modalidad !== 'domicilio') {
    return res.status(400).json({ mensaje: 'Selecciona una modalidad válida.' });
  }

  try {
    const [especialistas] = await pool.execute(
      `SELECT id_usuario
       FROM usuario
       WHERE id_usuario = ? AND rol = ? AND estado = ?
       LIMIT 1`,
      [idEspecialista, 'especialista', 'ACTIVO']
    );
    if (especialistas.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontró un especialista activo con ese identificador.' });
    }

    const horasDisponibles = await calcularHorasDisponibles(pool, {
      idEspecialista,
      fecha,
      duracion,
      modalidad
    });
    return res.json({ horas_disponibles: horasDisponibles });
  } catch (error) {
    console.error('Error al consultar la disponibilidad:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible consultar la disponibilidad.' });
  }
}

module.exports = {
  listarEspecialistas,
  consultarDisponibilidad
};
