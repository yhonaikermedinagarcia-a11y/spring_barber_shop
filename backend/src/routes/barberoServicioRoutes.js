const express = require('express');
const router = express.Router();
const {
  obtenerServiciosPorBarbero,
  asignarServicioABarbero,
  eliminarServicioDeBarbero
} = require('../controllers/barberoServicioController');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

// El catálogo de servicios de un barbero es consultable por el público (el cliente
// necesita ver qué ofrece antes de reservar)
router.get('/barbero/:barberoID', obtenerServiciosPorBarbero);

// Asignar y desvincular servicios es solo para administradores o barberos
router.post('/', verificarToken, verificarRol(['administrador', 'barbero']), asignarServicioABarbero);
router.delete('/:barberoID/:servicioID', verificarToken, verificarRol(['administrador', 'barbero']), eliminarServicioDeBarbero);

module.exports = router;