const express = require('express');
const router = express.Router();
const {
  obtenerTransacciones,
  crearTransaccion
} = require('../controllers/transaccionController');
const { verificarToken, verificarRol } = require('../middlewares/authMiddleware');

// Ver el libro de movimientos y mover saldo son acciones de administración:
// cualquier cliente autenticado podría inflarse su propio saldo_restante.
router.get('/', verificarToken, verificarRol(['administrador']), obtenerTransacciones);
router.post('/', verificarToken, verificarRol(['administrador']), crearTransaccion);

module.exports = router;
