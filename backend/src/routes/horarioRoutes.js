const express = require('express');
const router = express.Router();
const {
  obtenerHorariosPorBarbero,
  guardarHorario,
  eliminarHorario
} = require('../controllers/horarioController');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

// El horario de un barbero es consultable por el público (lo necesita el cliente
// para ver disponibilidad antes de reservar)
router.get('/barbero/:barberoID', obtenerHorariosPorBarbero);

// Configurar y eliminar horarios es solo para administradores o el propio barbero
router.post('/', verificarToken, verificarRol(['administrador', 'barbero']), guardarHorario);
router.delete('/barbero/:barberoID/:dia', verificarToken, verificarRol(['administrador', 'barbero']), eliminarHorario);

module.exports = router;
