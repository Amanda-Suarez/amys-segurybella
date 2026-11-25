const express = require('express');
const { resumen, diario } = require('../controllers/reporteController');
const { verificarToken, permitirRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/resumen', verificarToken, permitirRoles('administrador'), resumen);
router.get('/diario', verificarToken, permitirRoles('administrador', 'recepcionista'), diario);

module.exports = router;
