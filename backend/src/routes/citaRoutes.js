const express = require('express');
const router = express.Router();
const {
  obtenerCitas,
  crearCita,
  actualizarEstadoCita
} = require('../controllers/citaController');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

// Solo usuarios autenticados pueden ver y crear citas
router.get('/', verificarToken, obtenerCitas);
router.post('/', verificarToken, crearCita);

// Solo administradores o barberos pueden cambiar el estado de una cita
router.put('/:id/estado', verificarToken, verificarRol(['administrador', 'barbero']), actualizarEstadoCita);

module.exports = router;