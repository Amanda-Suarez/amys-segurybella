const { pool } = require('../config/db');
const {
  crearFechaHoraLocal
} = require('../config/agenda');
const { HORAS_MIN_CANCELAR } = require('../config/reglas');
const { crearCitaEnTransaccion, obtenerCitaCompleta } = require('../services/citaService');

function validarId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function crearErrorCita(estado, mensaje) {
  const error = new Error(mensaje);
  error.estadoHttp = estado;
  return error;
}

async function crearCita(req, res) {
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  let conexion;
  let transaccionIniciada = false;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    transaccionIniciada = true;
    const cita = await crearCitaEnTransaccion(
      conexion,
      datos,
      req.usuario.id_usuario,
      'pendiente'
    );

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
