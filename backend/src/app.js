const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Módulos de rutas
const usuarioRoutes = require('./routes/usuarioRoutes');
const servicioRoutes = require('./routes/servicioRoutes');
const barberoRoutes = require('./routes/barberoRoutes');
const citaRoutes = require('./routes/citaRoutes');
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/servicios', servicioRoutes);
app.use('/api/barberos', barberoRoutes);
app.use('/api/citas', citaRoutes);

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