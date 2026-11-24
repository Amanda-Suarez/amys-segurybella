const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const mensajeCredencialesInvalidas = 'Correo o contraseña incorrectos';

function obtenerDatosPublicos(usuario) {
  return {
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    correo: usuario.correo,
    telefono: usuario.telefono,
    direccion: usuario.direccion,
    rol: usuario.rol
  };
}

async function registro(req, res) {
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  const correo = typeof datos.correo === 'string' ? datos.correo.trim().toLowerCase() : '';
  const contrasenia = typeof datos.contrasenia === 'string' ? datos.contrasenia : '';
  const telefono = typeof datos.telefono === 'string' ? datos.telefono.trim() : '';
  const direccion = typeof datos.direccion === 'string' && datos.direccion.trim()
    ? datos.direccion.trim()
    : null;
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

  if (!nombre || nombre.length > 150) {
    return res.status(400).json({ mensaje: 'Ingresa un nombre válido.' });
  }
  if (!correoValido || correo.length > 150) {
    return res.status(400).json({ mensaje: 'Ingresa un correo válido.' });
  }
  if (contrasenia.length < 8) {
    return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 8 caracteres.' });
  }
  if (!telefono || telefono.length > 20) {
    return res.status(400).json({ mensaje: 'Ingresa un teléfono válido.' });
  }
  if (direccion && direccion.length > 255) {
    return res.status(400).json({ mensaje: 'La dirección no puede superar 255 caracteres.' });
  }

  try {
    const [usuariosExistentes] = await pool.execute(
      'SELECT id_usuario FROM usuario WHERE correo = ? LIMIT 1',
      [correo]
    );
    if (usuariosExistentes.length > 0) {
      return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo.' });
    }

    const hash = await bcrypt.hash(contrasenia, 10);
    const [resultado] = await pool.execute(
      `INSERT INTO usuario
        (nombre, correo, contrasenia, telefono, direccion, rol, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, correo, hash, telefono, direccion, 'cliente', 'ACTIVO']
    );

    return res.status(201).json({
      mensaje: 'La cuenta se creó correctamente.',
      usuario: obtenerDatosPublicos({
        id_usuario: resultado.insertId,
        nombre,
        correo,
        telefono,
        direccion,
        rol: 'cliente'
      })
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo.' });
    }
    console.error('Error al registrar un cliente:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible completar el registro.' });
  }
}

async function login(req, res) {
  const datos = req.body && typeof req.body === 'object' ? req.body : {};
  const correo = typeof datos.correo === 'string' ? datos.correo.trim().toLowerCase() : '';
  const contrasenia = typeof datos.contrasenia === 'string' ? datos.contrasenia : '';

  if (!correo || !contrasenia) {
    return res.status(401).json({ mensaje: mensajeCredencialesInvalidas });
  }

  try {
    const [usuarios] = await pool.execute(
      `SELECT id_usuario, nombre, correo, contrasenia, telefono, direccion, rol, estado
       FROM usuario
       WHERE correo = ?
       LIMIT 1`,
      [correo]
    );
    const usuario = usuarios[0];

    if (!usuario || usuario.estado !== 'ACTIVO') {
      return res.status(401).json({ mensaje: mensajeCredencialesInvalidas });
    }

    const contraseniaValida = await bcrypt.compare(contrasenia, usuario.contrasenia);
    if (!contraseniaValida) {
      return res.status(401).json({ mensaje: mensajeCredencialesInvalidas });
    }

    const token = jwt.sign(
      {
        id_usuario: usuario.id_usuario,
        rol: usuario.rol,
        nombre: usuario.nombre
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRA || '8h' }
    );

    return res.json({
      token,
      usuario: obtenerDatosPublicos(usuario)
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible iniciar sesión.' });
  }
}

module.exports = {
  registro,
  login
};
