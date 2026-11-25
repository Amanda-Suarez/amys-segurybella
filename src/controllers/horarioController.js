const { pool } = require('../config/db');

function validarId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function convertirHoraEnMinutos(hora) {
  if (typeof hora !== 'string') return null;
  const coincidencia = hora.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/);
  if (!coincidencia) return null;
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  const segundos = Number(coincidencia[3] || 0);
  if (horas > 24 || (horas === 24 && (minutos !== 0 || segundos !== 0)) || segundos !== 0) return null;
  return horas * 60 + minutos;
}

function formatoHora(hora) {
  const minutos = convertirHoraEnMinutos(hora);
  return minutos === null ? null : `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}:00`;
}

function diaSemanaLocal(fechaTexto) {
  const partes = fechaTexto.slice(0, 10).split('-').map(Number);
  if (partes.length !== 3) return null;
  const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
  if (Number.isNaN(fecha.getTime())) return null;
  return (fecha.getDay() + 6) % 7 + 1;
}

function errorHttp(estado, mensaje) {
  const error = new Error(mensaje);
  error.estadoHttp = estado;
  return error;
}

async function validarEspecialistaActivo(conexion, idEspecialista) {
  const [usuarios] = await conexion.execute(
    `SELECT id_usuario
     FROM usuario
     WHERE id_usuario = ? AND rol = ? AND estado = ?
     LIMIT 1
     FOR UPDATE`,
    [idEspecialista, 'especialista', 'ACTIVO']
  );
  if (usuarios.length === 0) {
    throw errorHttp(400, 'El usuario seleccionado no es un especialista activo.');
  }
}

function validarBloque(datos) {
  const idEspecialista = validarId(datos.id_especialista);
  const dia = Number(datos.dia_semana);
  const inicio = convertirHoraEnMinutos(datos.hora_inicio);
  const fin = convertirHoraEnMinutos(datos.hora_fin);

  if (!idEspecialista) return { error: 'Selecciona un especialista válido.' };
  if (!Number.isInteger(dia) || dia < 1 || dia > 7) return { error: 'El día de la semana no es válido.' };
  if (inicio === null || fin === null) return { error: 'Indica horas válidas en formato HH:MM.' };
  if (fin <= inicio) return { error: 'La hora_fin debe ser mayor que la hora_inicio.' };
  if (inicio % 30 !== 0 || fin % 30 !== 0) return { error: 'Los minutos de inicio y fin deben ser múltiplos de 30.' };
  return { idEspecialista, dia, inicio, fin };
}

async function listarHorarios(req, res) {
  let idEspecialista = null;
  if (req.query.id_especialista !== undefined) {
    idEspecialista = validarId(req.query.id_especialista);
    if (!idEspecialista) {
      return res.status(400).json({ mensaje: 'El identificador del especialista no es válido.' });
    }
  }

  try {
    const [especialistas] = await pool.execute(
      `SELECT id_usuario, nombre
       FROM usuario
       WHERE rol = ? AND estado = ?
       ORDER BY nombre ASC`,
      ['especialista', 'ACTIVO']
    );
    let horarios;
    if (idEspecialista) {
      [horarios] = await pool.execute(
        `SELECT h.id_horario, h.id_especialista, h.dia_semana,
                h.hora_inicio, h.hora_fin, u.nombre AS nombre_especialista
         FROM horario_especialista h
         INNER JOIN usuario u ON u.id_usuario = h.id_especialista
         WHERE h.id_especialista = ?
         ORDER BY h.dia_semana ASC, h.hora_inicio ASC`,
        [idEspecialista]
      );
    } else {
      [horarios] = await pool.execute(
        `SELECT h.id_horario, h.id_especialista, h.dia_semana,
                h.hora_inicio, h.hora_fin, u.nombre AS nombre_especialista
         FROM horario_especialista h
         INNER JOIN usuario u ON u.id_usuario = h.id_especialista
         WHERE u.rol = ? AND u.estado = ?
         ORDER BY u.nombre ASC, h.dia_semana ASC, h.hora_inicio ASC`,
        ['especialista', 'ACTIVO']
      );
    }
    return res.json({ horarios, especialistas });
  } catch (error) {
    console.error('Error al listar horarios:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener los horarios.' });
  }
}

async function crearHorario(req, res) {
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  const validacion = validarBloque(datos);
  if (validacion.error) return res.status(400).json({ mensaje: validacion.error });

  let conexion;
  let iniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    iniciada = true;
    await validarEspecialistaActivo(conexion, validacion.idEspecialista);

    const [existentes] = await conexion.execute(
      `SELECT id_horario
       FROM horario_especialista
       WHERE id_especialista = ? AND dia_semana = ?
         AND hora_inicio < ? AND hora_fin > ?
       FOR UPDATE`,
      [validacion.idEspecialista, validacion.dia, formatoHora(datos.hora_fin), formatoHora(datos.hora_inicio)]
    );
    if (existentes.length > 0) {
      throw errorHttp(409, 'El bloque se solapa con otro horario del mismo especialista en ese día.');
    }

    const [resultado] = await conexion.execute(
      `INSERT INTO horario_especialista
        (id_especialista, dia_semana, hora_inicio, hora_fin)
       VALUES (?, ?, ?, ?)`,
      [validacion.idEspecialista, validacion.dia, formatoHora(datos.hora_inicio), formatoHora(datos.hora_fin)]
    );
    await conexion.commit();
    iniciada = false;
    return res.status(201).json({
      mensaje: 'El bloque horario se creó correctamente.',
      horario: {
        id_horario: resultado.insertId,
        id_especialista: validacion.idEspecialista,
        dia_semana: validacion.dia,
        hora_inicio: formatoHora(datos.hora_inicio),
        hora_fin: formatoHora(datos.hora_fin)
      }
    });
  } catch (error) {
    if (iniciada && conexion) await conexion.rollback();
    if (error.estadoHttp) return res.status(error.estadoHttp).json({ mensaje: error.message });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ mensaje: 'Ya existe un bloque con esa hora de inicio.' });
    console.error('Error al crear un horario:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible crear el bloque horario.' });
  } finally {
    if (conexion) conexion.release();
  }
}

async function editarHorario(req, res) {
  const idHorario = validarId(req.params.id);
  if (!idHorario) return res.status(400).json({ mensaje: 'El identificador del horario no es válido.' });
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  const validacion = validarBloque(datos);
  if (validacion.error) return res.status(400).json({ mensaje: validacion.error });

  let conexion;
  let iniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    iniciada = true;
    await validarEspecialistaActivo(conexion, validacion.idEspecialista);
    const [bloques] = await conexion.execute(
      `SELECT id_horario
       FROM horario_especialista
       WHERE id_horario = ?
       LIMIT 1
       FOR UPDATE`,
      [idHorario]
    );
    if (bloques.length === 0) throw errorHttp(404, 'No se encontró el bloque horario solicitado.');

    const [existentes] = await conexion.execute(
      `SELECT id_horario
       FROM horario_especialista
       WHERE id_horario <> ? AND id_especialista = ? AND dia_semana = ?
         AND hora_inicio < ? AND hora_fin > ?
       FOR UPDATE`,
      [
        idHorario,
        validacion.idEspecialista,
        validacion.dia,
        formatoHora(datos.hora_fin),
        formatoHora(datos.hora_inicio)
      ]
    );
    if (existentes.length > 0) {
      throw errorHttp(409, 'El bloque se solapa con otro horario del mismo especialista en ese día.');
    }

    await conexion.execute(
      `UPDATE horario_especialista
       SET id_especialista = ?, dia_semana = ?, hora_inicio = ?, hora_fin = ?
       WHERE id_horario = ?`,
      [validacion.idEspecialista, validacion.dia, formatoHora(datos.hora_inicio), formatoHora(datos.hora_fin), idHorario]
    );
    await conexion.commit();
    iniciada = false;
    return res.json({
      mensaje: 'El bloque horario se actualizó correctamente.',
      horario: {
        id_horario: idHorario,
        id_especialista: validacion.idEspecialista,
        dia_semana: validacion.dia,
        hora_inicio: formatoHora(datos.hora_inicio),
        hora_fin: formatoHora(datos.hora_fin)
      }
    });
  } catch (error) {
    if (iniciada && conexion) await conexion.rollback();
    if (error.estadoHttp) return res.status(error.estadoHttp).json({ mensaje: error.message });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ mensaje: 'Ya existe un bloque con esa hora de inicio.' });
    console.error('Error al editar un horario:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible actualizar el bloque horario.' });
  } finally {
    if (conexion) conexion.release();
  }
}

async function eliminarHorario(req, res) {
  const idHorario = validarId(req.params.id);
  if (!idHorario) return res.status(400).json({ mensaje: 'El identificador del horario no es válido.' });

  let conexion;
  let iniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    iniciada = true;
    const [bloques] = await conexion.execute(
      `SELECT id_horario, id_especialista, dia_semana, hora_inicio, hora_fin
       FROM horario_especialista
       WHERE id_horario = ?
       LIMIT 1
       FOR UPDATE`,
      [idHorario]
    );
    if (bloques.length === 0) throw errorHttp(404, 'No se encontró el bloque horario solicitado.');
    const bloque = bloques[0];

    const [citas] = await conexion.execute(
      `SELECT id_cita, fecha_cita, hora_cita, hora_fin
       FROM cita
       WHERE id_especialista = ? AND fecha_cita >= CURDATE()
         AND estado_cita NOT IN (?, ?)
       FOR UPDATE`,
      [bloque.id_especialista, 'cancelada', 'completada']
    );
    const inicioBloque = convertirHoraEnMinutos(bloque.hora_inicio);
    const finBloque = convertirHoraEnMinutos(bloque.hora_fin);
    const conflicto = citas.find((cita) => {
      if (diaSemanaLocal(cita.fecha_cita) !== Number(bloque.dia_semana)) return false;
      const inicioCita = convertirHoraEnMinutos(cita.hora_cita);
      const finCita = convertirHoraEnMinutos(cita.hora_fin);
      return inicioCita !== null && finCita !== null
        && inicioCita < finBloque && finCita > inicioBloque;
    });
    if (conflicto) {
      throw errorHttp(409, 'No puedes eliminar el bloque porque existen citas futuras dentro de ese horario.');
    }

    await conexion.execute('DELETE FROM horario_especialista WHERE id_horario = ?', [idHorario]);
    await conexion.commit();
    iniciada = false;
    return res.json({ mensaje: 'El bloque horario se eliminó correctamente.' });
  } catch (error) {
    if (iniciada && conexion) await conexion.rollback();
    if (error.estadoHttp) return res.status(error.estadoHttp).json({ mensaje: error.message });
    console.error('Error al eliminar un horario:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible eliminar el bloque horario.' });
  } finally {
    if (conexion) conexion.release();
  }
}

module.exports = { listarHorarios, crearHorario, editarHorario, eliminarHorario };
