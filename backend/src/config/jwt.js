require('dotenv').config();

// Fuente única del secreto de JWT. Se comparte entre authController (firma) y
// authMiddleware (verifica): si divergieran, un token firmado por uno sería
// rechazado por el otro. Se falla al arrancar en vez de usar un valor por defecto,
// porque un secreto hardcodeado en el código queda expuesto en el repositorio.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET. Defínela en backend/.env');
}

const JWT_EXPIRES_IN = '8h';

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN
};
