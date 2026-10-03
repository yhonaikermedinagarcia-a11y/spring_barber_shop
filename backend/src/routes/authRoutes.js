const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const { limitadorLogin, reiniciarSiExito } = require('../middlewares/rateLimit');

// El limitador va antes del handler: corta el intento fallido antes de tocar la
// base de datos, que es justo lo que un ataque de fuerza bruta busca agotar.
router.post('/login', limitadorLogin, reiniciarSiExito, login);

module.exports = router;