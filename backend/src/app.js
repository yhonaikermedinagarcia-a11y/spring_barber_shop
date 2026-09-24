const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Módulos de rutas
const usuarioRoutes = require('./routes/usuarioRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/usuarios', usuarioRoutes);

// Ruta base
app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: '💈 API de Barbería ejecutándose correctamente',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});