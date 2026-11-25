const express = require('express');
const {
  listarHorarios,
  crearHorario,
  editarHorario,
  eliminarHorario
} = require('../controllers/horarioController');
const { verificarToken, permitirRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verificarToken, permitirRoles('administrador'), listarHorarios);
router.post('/', verificarToken, permitirRoles('administrador'), crearHorario);
router.put('/:id', verificarToken, permitirRoles('administrador'), editarHorario);
router.delete('/:id', verificarToken, permitirRoles('administrador'), eliminarHorario);

module.exports = router;
