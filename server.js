require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { probarConexion } = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const perfilRoutes = require('./src/routes/perfilRoutes');

const app = express();
const puerto = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api/perfil', perfilRoutes);

app.get('/api/salud', async (req, res) => {
  try {
    await probarConexion();
    res.json({
      estado: 'ok',
      baseDatos: process.env.DB_NAME
    });
  } catch (error) {
    console.error('Error al conectar con MySQL desde /api/salud:', error.message);
    res.status(500).json({
      estado: 'error',
      mensaje: 'No fue posible conectar con la base de datos.'
    });
  }
});

app.listen(puerto, () => {
  console.log(`Servidor Amys Segura & Bella escuchando en el puerto ${puerto}.`);
});
