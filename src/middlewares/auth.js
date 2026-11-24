const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
  const encabezado = req.get('Authorization') || '';
  const coincidencia = encabezado.match(/^Bearer\s+(.+)$/i);

  if (!coincidencia) {
    return res.status(401).json({ mensaje: 'Se requiere un token de autenticación.' });
  }

  try {
    const carga = jwt.verify(coincidencia[1], process.env.JWT_SECRET);
    if (
      !carga
      || typeof carga !== 'object'
      || !Number.isInteger(carga.id_usuario)
      || typeof carga.rol !== 'string'
      || typeof carga.nombre !== 'string'
    ) {
      return res.status(401).json({ mensaje: 'El token de autenticación no es válido.' });
    }

    req.usuario = {
      id_usuario: carga.id_usuario,
      rol: carga.rol,
      nombre: carga.nombre
    };
    return next();
  } catch (error) {
    return res.status(401).json({ mensaje: 'El token de autenticación no es válido o ha expirado.' });
  }
}

function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ mensaje: 'Se requiere un token de autenticación.' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: 'No tienes permiso para acceder a este recurso.' });
    }
    return next();
  };
}

module.exports = {
  verificarToken,
  permitirRoles
};
