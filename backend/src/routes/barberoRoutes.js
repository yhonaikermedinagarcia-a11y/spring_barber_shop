const express = require('express');
const router = express.Router();
const {
  obtenerBarberos,
  obtenerBarberoPorId,
  crearBarbero
} = require('../controllers/barberoController');

router.get('/', obtenerBarberos);
router.get('/:id', obtenerBarberoPorId);
router.post('/', crearBarbero);

module.exports = router;