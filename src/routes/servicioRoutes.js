const express = require('express');
const {
  listarCategorias,
  listarServicios,
  obtenerServicio,
  listarTodosLosServicios,
  crearServicio,
  actualizarServicio,
  actualizarEstadoServicio
} = require('../controllers/servicioController');
const { verificarToken, permitirRoles } = require('../middlewares/auth');

const router = express.Router();
const soloAdministrador = [verificarToken, permitirRoles('administrador')];

router.get('/categorias', listarCategorias);
router.get('/servicios/admin/todos', ...soloAdministrador, listarTodosLosServicios);
router.get('/servicios', listarServicios);
router.get('/servicios/:id', obtenerServicio);
router.post('/servicios', ...soloAdministrador, crearServicio);
router.put('/servicios/:id', ...soloAdministrador, actualizarServicio);
router.patch('/servicios/:id/estado', ...soloAdministrador, actualizarEstadoServicio);

module.exports = router;
