const express = require('express');
const { obtenerPerfil, actualizarPerfil } = require('../controllers/perfilController');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verificarToken, obtenerPerfil);
router.put('/', verificarToken, actualizarPerfil);

module.exports = router;
