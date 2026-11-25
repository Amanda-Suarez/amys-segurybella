const express = require('express');
const {
  listarEspecialistas,
  consultarDisponibilidad
} = require('../controllers/disponibilidadController');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/especialistas', verificarToken, listarEspecialistas);
router.get('/disponibilidad', verificarToken, consultarDisponibilidad);

module.exports = router;
