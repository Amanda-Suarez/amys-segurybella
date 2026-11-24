const { pool } = require('../config/db');

function validarId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validarDatosServicio(datos) {
  const nombre = typeof datos.nombre_servicio === 'string'
    ? datos.nombre_servicio.trim()
    : '';
  const idCategoria = validarId(datos.id_categoria);
  const precio = Number(datos.precio);
  const duracion = Number(datos.duracion_minutos);
  const descripcion = datos.descripcion == null
    ? null
    : typeof datos.descripcion === 'string'
      ? datos.descripcion.trim() || null
      : undefined;
  const imagenUrl = datos.imagen_url == null
    ? null
    : typeof datos.imagen_url === 'string'
      ? datos.imagen_url.trim() || null
      : undefined;

  if (!nombre || nombre.length > 150) {
    return { error: 'Ingresa un nombre de servicio válido.' };
  }
  if (!idCategoria) {
    return { error: 'Selecciona una categoría válida.' };
  }
  if (!Number.isFinite(precio)
    || precio <= 0
    || Number(precio.toFixed(2)) <= 0
    || precio > 999999.99) {
    return { error: 'El precio debe ser mayor que 0 y no superar 999999.99.' };
  }
  if (!Number.isInteger(duracion) || duracion <= 0 || duracion % 5 !== 0) {
    return { error: 'La duración debe ser mayor que 0 y múltiplo de 5 minutos.' };
  }
  if (descripcion === undefined || (descripcion && descripcion.length > 16000)) {
    return { error: 'Ingresa una descripción válida.' };
  }
  if (imagenUrl === undefined || (imagenUrl && imagenUrl.length > 500)) {
    return { error: 'Ingresa una URL de imagen válida.' };
  }

  return {
    datos: {
      nombre,
      idCategoria,
      precio: Number(precio.toFixed(2)),
      duracion,
      descripcion,
      imagenUrl
    }
  };
}

async function validarCategoria(idCategoria) {
  const [categorias] = await pool.execute(
    'SELECT id_categoria FROM categoria WHERE id_categoria = ? LIMIT 1',
    [idCategoria]
  );
  return categorias.length > 0;
}

async function listarCategorias(req, res) {
  try {
    const [categorias] = await pool.execute(
      'SELECT id_categoria, nombre_categoria FROM categoria ORDER BY nombre_categoria'
    );
    return res.json({ categorias });
  } catch (error) {
    console.error('Error al listar categorías:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener las categorías.' });
  }
}

async function listarServicios(req, res) {
  const condiciones = ['s.estado = ?'];
  const valores = ['ACTIVO'];

  if (req.query.categoria !== undefined) {
    const idCategoria = validarId(req.query.categoria);
    if (!idCategoria) {
      return res.status(400).json({ mensaje: 'El filtro de categoría no es válido.' });
    }
    condiciones.push('s.id_categoria = ?');
    valores.push(idCategoria);
  }

  if (req.query.buscar !== undefined) {
    if (typeof req.query.buscar !== 'string' || req.query.buscar.trim().length > 100) {
      return res.status(400).json({ mensaje: 'El texto de búsqueda no es válido.' });
    }
    const texto = `%${req.query.buscar.trim()}%`;
    condiciones.push('(s.nombre_servicio LIKE ? OR s.descripcion LIKE ?)');
    valores.push(texto, texto);
  }

  try {
    const [servicios] = await pool.execute(
      `SELECT s.id_servicio, s.id_categoria, c.nombre_categoria,
              s.nombre_servicio, s.descripcion, s.precio,
              s.duracion_minutos, s.imagen_url, s.estado
       FROM servicio s
       INNER JOIN categoria c ON c.id_categoria = s.id_categoria
       WHERE ${condiciones.join(' AND ')}
       ORDER BY s.nombre_servicio`,
      valores
    );
    return res.json({ servicios });
  } catch (error) {
    console.error('Error al listar servicios activos:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener los servicios.' });
  }
}

async function obtenerServicio(req, res) {
  const idServicio = validarId(req.params.id);
  if (!idServicio) {
    return res.status(400).json({ mensaje: 'El identificador del servicio no es válido.' });
  }

  try {
    const [servicios] = await pool.execute(
      `SELECT s.id_servicio, s.id_categoria, c.nombre_categoria,
              s.nombre_servicio, s.descripcion, s.precio,
              s.duracion_minutos, s.imagen_url, s.estado
       FROM servicio s
       INNER JOIN categoria c ON c.id_categoria = s.id_categoria
       WHERE s.id_servicio = ? AND s.estado = ?
       LIMIT 1`,
      [idServicio, 'ACTIVO']
    );
    if (servicios.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontró el servicio solicitado.' });
    }
    return res.json({ servicio: servicios[0] });
  } catch (error) {
    console.error('Error al consultar el detalle del servicio:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener el servicio.' });
  }
}

async function listarTodosLosServicios(req, res) {
  try {
    const [servicios] = await pool.execute(
      `SELECT s.id_servicio, s.id_categoria, c.nombre_categoria,
              s.nombre_servicio, s.descripcion, s.precio,
              s.duracion_minutos, s.imagen_url, s.estado
       FROM servicio s
       INNER JOIN categoria c ON c.id_categoria = s.id_categoria
       ORDER BY s.nombre_servicio`
    );
    return res.json({ servicios });
  } catch (error) {
    console.error('Error al listar todos los servicios:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible obtener los servicios.' });
  }
}

async function crearServicio(req, res) {
  const resultadoValidacion = validarDatosServicio(req.body || {});
  if (resultadoValidacion.error) {
    return res.status(400).json({ mensaje: resultadoValidacion.error });
  }

  const servicio = resultadoValidacion.datos;
  try {
    if (!await validarCategoria(servicio.idCategoria)) {
      return res.status(400).json({ mensaje: 'La categoría seleccionada no existe.' });
    }

    const [resultado] = await pool.execute(
      `INSERT INTO servicio
        (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, imagen_url, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        servicio.idCategoria,
        servicio.nombre,
        servicio.descripcion,
        servicio.precio,
        servicio.duracion,
        servicio.imagenUrl,
        'ACTIVO'
      ]
    );
    return res.status(201).json({
      mensaje: 'El servicio se creó correctamente.',
      id_servicio: resultado.insertId
    });
  } catch (error) {
    console.error('Error al crear el servicio:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible crear el servicio.' });
  }
}

async function actualizarServicio(req, res) {
  const idServicio = validarId(req.params.id);
  if (!idServicio) {
    return res.status(400).json({ mensaje: 'El identificador del servicio no es válido.' });
  }

  const resultadoValidacion = validarDatosServicio(req.body || {});
  if (resultadoValidacion.error) {
    return res.status(400).json({ mensaje: resultadoValidacion.error });
  }

  const servicio = resultadoValidacion.datos;
  try {
    if (!await validarCategoria(servicio.idCategoria)) {
      return res.status(400).json({ mensaje: 'La categoría seleccionada no existe.' });
    }

    const [serviciosExistentes] = await pool.execute(
      'SELECT id_servicio FROM servicio WHERE id_servicio = ? LIMIT 1',
      [idServicio]
    );
    if (serviciosExistentes.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontró el servicio solicitado.' });
    }

    await pool.execute(
      `UPDATE servicio
       SET nombre_servicio = ?, descripcion = ?, id_categoria = ?,
           precio = ?, duracion_minutos = ?, imagen_url = ?
       WHERE id_servicio = ?`,
      [
        servicio.nombre,
        servicio.descripcion,
        servicio.idCategoria,
        servicio.precio,
        servicio.duracion,
        servicio.imagenUrl,
        idServicio
      ]
    );
    return res.json({ mensaje: 'El servicio se actualizó correctamente.' });
  } catch (error) {
    console.error('Error al actualizar el servicio:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible actualizar el servicio.' });
  }
}

async function actualizarEstadoServicio(req, res) {
  const idServicio = validarId(req.params.id);
  const estado = req.body && req.body.estado;
  if (!idServicio) {
    return res.status(400).json({ mensaje: 'El identificador del servicio no es válido.' });
  }
  if (estado !== 'ACTIVO' && estado !== 'INACTIVO') {
    return res.status(400).json({ mensaje: 'El estado debe ser ACTIVO o INACTIVO.' });
  }

  try {
    const [resultado] = await pool.execute(
      'UPDATE servicio SET estado = ? WHERE id_servicio = ?',
      [estado, idServicio]
    );
    if (resultado.affectedRows === 0) {
      const [servicios] = await pool.execute(
        'SELECT id_servicio FROM servicio WHERE id_servicio = ? LIMIT 1',
        [idServicio]
      );
      if (servicios.length === 0) {
        return res.status(404).json({ mensaje: 'No se encontró el servicio solicitado.' });
      }
    }
    return res.json({ mensaje: `El servicio ahora está ${estado.toLowerCase()}.` });
  } catch (error) {
    console.error('Error al cambiar el estado del servicio:', error.message);
    return res.status(500).json({ mensaje: 'No fue posible cambiar el estado del servicio.' });
  }
}

module.exports = {
  listarCategorias,
  listarServicios,
  obtenerServicio,
  listarTodosLosServicios,
  crearServicio,
  actualizarServicio,
  actualizarEstadoServicio
};
