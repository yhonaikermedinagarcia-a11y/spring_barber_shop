const express = require('express');
const router = express.Router();
const {
  obtenerAusenciasBarbero,
  obtenerAusencias,
  crearAusencia,
  eliminarAusencia
} = require('../controllers/ausenciaController');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

// Permisos (ausencias) de los barberos. Ver controllers/ausenciaController.js.
router.get('/barbero/:barberoID', obtenerAusenciasBarbero);
router.get('/', verificarToken, verificarRol(['administrador', 'barbero']), obtenerAusencias);
router.post('/', verificarToken, verificarRol(['administrador', 'barbero']), crearAusencia);
router.delete('/:id', verificarToken, verificarRol(['administrador', 'barbero']), eliminarAusencia);

module.exports = router;
