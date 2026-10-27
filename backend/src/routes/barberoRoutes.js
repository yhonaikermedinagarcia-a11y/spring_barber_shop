const express = require('express');
const router = express.Router();
const {
  obtenerBarberos,
  obtenerBarberoPorId,
  crearBarbero,
  actualizarBarbero,
  actualizarFotoBarbero,
  eliminarBarbero
} = require('../controllers/barberoController');
const {
  obtenerResenasBarbero,
  obtenerTodasResenas,
  crearResena,
  eliminarResena
} = require('../controllers/resenaController');
const { verificarToken, verificarTokenOpcional, verificarRol } = require('../middlewares/authMiddleware');
const { subirArchivo } = require('../config/subidas');

router.get('/', verificarTokenOpcional, obtenerBarberos);

// Dar de alta a un barbero es una acción de administración: es quien decide
// quién atiende en la peluquería.
router.post('/', verificarToken, verificarRol(['administrador']), crearBarbero);

/*
 * Reseñas.
 *
 * `/resenas` va ANTES de `/:id`: si no, Express interpretaría "resenas" como
 * un id de barbero y la respuesta sería un 400 ("El ID del barbero debe ser un
 * número entero válido") en vez de la lista de reseñas.
 */
router.get('/resenas', verificarToken, verificarRol(['administrador']), obtenerTodasResenas);
router.delete('/resenas/:resenaID', verificarToken, verificarRol(['administrador']), eliminarResena);

// Las reseñas de un barbero son públicas: se ven en su ficha.
router.get('/:barberoID/resenas', obtenerResenasBarbero);
router.post('/:barberoID/resenas', verificarToken, crearResena);

// Editar la ficha: el administrador puede corregir cualquier barbero y el
// barbero puede editar la suya.
router.put('/:id', verificarToken, verificarRol(['administrador', 'barbero']), actualizarBarbero);

// Quitar a un barbero del equipo. Es una acción de administración: borra la
// ficha (con sus horarios y sus citas), no la cuenta de usuario.
router.delete('/:id', verificarToken, verificarRol(['administrador']), eliminarBarbero);

// La foto se manda como multipart/form-data con el campo "foto".
router.post(
  '/:id/foto',
  verificarToken,
  verificarRol(['administrador', 'barbero']),
  subirArchivo.single('foto'),
  actualizarFotoBarbero
);

router.get('/:id', verificarTokenOpcional, obtenerBarberoPorId);

module.exports = router;
