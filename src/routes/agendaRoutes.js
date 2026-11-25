const express = require('express');
const {
  listarMisCitas,
  listarAgenda,
  cambiarEstado,
  crearCitaManual,
  resumenHoy
} = require('../controllers/agendaController');
const { verificarToken, permitirRoles } = require('../middlewares/auth');

const router = express.Router();

router.get('/mias', verificarToken, permitirRoles('cliente'), listarMisCitas);
router.get(
  '/agenda',
  verificarToken,
  permitirRoles('administrador', 'recepcionista', 'especialista'),
  listarAgenda
);
router.post(
  '/manual',
  verificarToken,
  permitirRoles('administrador', 'recepcionista'),
  crearCitaManual
);
router.put(
  '/:id/estado',
  verificarToken,
  permitirRoles('administrador', 'recepcionista', 'especialista'),
  cambiarEstado
);
router.get(
  '/resumen-hoy',
  verificarToken,
  permitirRoles('administrador', 'recepcionista'),
  resumenHoy
);

module.exports = router;
