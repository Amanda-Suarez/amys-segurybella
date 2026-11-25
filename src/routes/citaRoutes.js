const express = require('express');
const {
  crearCita,
  obtenerCita,
  cancelarCita
} = require('../controllers/citaController');
const { verificarToken, permitirRoles } = require('../middlewares/auth');

const router = express.Router();

router.post('/', verificarToken, permitirRoles('cliente'), crearCita);
router.get('/:id', verificarToken, obtenerCita);
router.put('/:id/cancelar', verificarToken, permitirRoles('cliente'), cancelarCita);

module.exports = router;
