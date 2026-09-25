const express = require('express');
const router = express.Router();
const {
  obtenerUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario
} = require('../controllers/usuarioController');

// GET /api/usuarios -> Obtener lista completa
router.get('/', obtenerUsuarios);

// GET /api/usuarios/:id -> Obtener por ID
router.get('/:id', obtenerUsuarioPorId);

// POST /api/usuarios -> Registrar un nuevo usuario
router.post('/', crearUsuario);

// PUT /api/usuarios/:id -> Actualizar usuario
router.put('/:id', actualizarUsuario);

// DELETE /api/usuarios/:id -> Eliminar usuario
router.delete('/:id', eliminarUsuario);

module.exports = router;