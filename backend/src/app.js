const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Módulos de rutas
const usuarioRoutes = require('./routes/usuarioRoutes');
const servicioRoutes = require('./routes/servicioRoutes');
const barberoRoutes = require('./routes/barberoRoutes');
const citaRoutes = require('./routes/citaRoutes');
const authRoutes = require('./routes/authRoutes');
const horarioRoutes = require('./routes/horarioRoutes');
const barberoServicioRoutes = require('./routes/barberoServicioRoutes');
const transaccionRoutes = require('./routes/transaccionRoutes');

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
app.use('/api/auth', authRoutes);
app.use('/api/horarios', horarioRoutes);
app.use('/api/barbero-servicios', barberoServicioRoutes);
app.use('/api/transacciones', transaccionRoutes);

// Ruta base
app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: '💈 API de Barbería ejecutándose correctamente',
    timestamp: new Date().toISOString()
  });
});

// Rutas no encontradas (debe ir después de montar los routers, antes de app.listen)
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: 'Recurso no encontrado'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});