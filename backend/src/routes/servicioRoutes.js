const express = require('express');
const router = express.Router();
const {
  obtenerServicios,
  obtenerServicioPorId,
  crearServicio
} = require('../controllers/servicioController');

router.get('/', obtenerServicios);
router.get('/:id', obtenerServicioPorId);
router.post('/', crearServicio);

module.exports = router;