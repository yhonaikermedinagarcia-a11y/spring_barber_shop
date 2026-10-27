const express = require('express');
const router = express.Router();
const {
  crearEspera,
  obtenerEsperas,
  obtenerMisEsperas,
  actualizarEstadoEspera,
  cancelarEspera
} = require('../controllers/listaEsperaController');
const { verificarToken, verificarTokenOpcional, verificarRol } = require('../middlewares/authMiddleware');

// Lista de espera. Ver controllers/listaEsperaController.js.
router.post('/', verificarTokenOpcional, crearEspera);
router.get('/', verificarToken, verificarRol(['administrador']), obtenerEsperas);
router.get('/mias', verificarToken, obtenerMisEsperas);
router.put('/:id/estado', verificarToken, verificarRol(['administrador']), actualizarEstadoEspera);
router.delete('/:id', verificarToken, cancelarEspera);

module.exports = router;
