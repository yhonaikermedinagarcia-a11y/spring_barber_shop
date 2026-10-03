const express = require('express');
const router = express.Router();
const { login, obtenerPerfil } = require('../controllers/authController');
const { verificarToken } = require('../middlewares/authMiddleware');
const { limitadorLogin, reiniciarSiExito } = require('../middlewares/rateLimit');

// El limitador va antes del handler: corta el intento fallido antes de tocar la
// base de datos, que es justo lo que un ataque de fuerza bruta busca agotar.
router.post('/login', limitadorLogin, reiniciarSiExito, login);

// Perfil del usuario autenticado. Una SPA lo necesita al recargar la página:
// el login solo devuelve los datos una vez.
router.get('/me', verificarToken, obtenerPerfil);

module.exports = router;