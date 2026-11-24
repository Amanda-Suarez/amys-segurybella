const { pool } = require('../config/db');

function obtenerDatosPerfil(usuario) {
  return {
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    correo: usuario.correo,
    telefono: usuario.telefono,
    direccion: usuario.direccion,
    rol: usuario.rol
  };
}

async function obtenerPerfil(req, res) {
  try {
    const [usuarios] = await pool.execute(
      `SELECT id_usuario, nombre, correo, telefono, direccion, rol
       FROM usuario
       WHERE id_usuario = ?
       LIMIT 1`,
      [req.usuario.id_usuario]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontró el perfil del usuario.' });
    }

    return res.json({ usuario: obtenerDatosPerfil(usuarios[0]) });
  } catch (error) {
    console.error('Error al consultar el perfil:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener el perfil.' });
  }
}

async function actualizarPerfil(req, res) {
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  const campos = [];
  const valores = [];

  if (Object.prototype.hasOwnProperty.call(datos, 'nombre')) {
    if (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.trim().length > 150) {
      return res.status(400).json({ mensaje: 'Ingresa un nombre válido.' });
    }
    campos.push('nombre = ?');
    valores.push(datos.nombre.trim());
  }

  if (Object.prototype.hasOwnProperty.call(datos, 'telefono')) {
    if (typeof datos.telefono !== 'string' || !datos.telefono.trim() || datos.telefono.trim().length > 20) {
      return res.status(400).json({ mensaje: 'Ingresa un teléfono válido.' });
    }
    campos.push('telefono = ?');
    valores.push(datos.telefono.trim());
  }

  if (Object.prototype.hasOwnProperty.call(datos, 'direccion')) {
    if (datos.direccion !== null && typeof datos.direccion !== 'string') {
      return res.status(400).json({ mensaje: 'Ingresa una dirección válida.' });
    }
    const direccion = typeof datos.direccion === 'string' ? datos.direccion.trim() : null;
    if (direccion && direccion.length > 255) {
      return res.status(400).json({ mensaje: 'La dirección no puede superar 255 caracteres.' });
    }
    campos.push('direccion = ?');
    valores.push(direccion || null);
  }

  if (campos.length === 0) {
    return res.status(400).json({ mensaje: 'Indica al menos un dato del perfil para actualizar.' });
  }

  try {
    valores.push(req.usuario.id_usuario);
    await pool.execute(
      `UPDATE usuario
       SET ${campos.join(', ')}
       WHERE id_usuario = ?`,
      valores
    );

    const [usuarios] = await pool.execute(
      `SELECT id_usuario, nombre, correo, telefono, direccion, rol
       FROM usuario
       WHERE id_usuario = ?
       LIMIT 1`,
      [req.usuario.id_usuario]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontró el perfil del usuario.' });
    }

    return res.json({
      mensaje: 'El perfil se actualizó correctamente.',
      usuario: obtenerDatosPerfil(usuarios[0])
    });
  } catch (error) {
    console.error('Error al actualizar el perfil:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible actualizar el perfil.' });
  }
}

module.exports = {
  obtenerPerfil,
  actualizarPerfil
};
