const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const usuariosDemo = [
  {
    nombre: 'Ely Segura',
    correo: 'ely.admin@amys.test',
    contrasenia: 'AmysAdmin2026!',
    telefono: '0991000001',
    direccion: 'Otavalo, Ecuador',
    rol: 'administrador'
  },
  {
    nombre: 'Ana Especialista',
    correo: 'ana.especialista@amys.test',
    contrasenia: 'AmysAna2026!',
    telefono: '0991000002',
    direccion: 'Otavalo, Ecuador',
    rol: 'especialista'
  },
  {
    nombre: 'Sofia Especialista',
    correo: 'sofia.especialista@amys.test',
    contrasenia: 'AmysSofia2026!',
    telefono: '0991000003',
    direccion: 'Ibarra, Ecuador',
    rol: 'especialista'
  },
  {
    nombre: 'Recepcionista Demo',
    correo: 'recepcion@amys.test',
    contrasenia: 'AmysRecepcion2026!',
    telefono: '0991000004',
    direccion: 'Otavalo, Ecuador',
    rol: 'recepcionista'
  },
  {
    nombre: 'Cliente Demo',
    correo: 'cliente@amys.test',
    contrasenia: 'AmysCliente2026!',
    telefono: '0991000005',
    direccion: 'Ibarra, Ecuador',
    rol: 'cliente'
  }
];

async function crearUsuariosDemo() {
  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'root',
    database: process.env.DB_NAME || 'amys_segura_bella',
    charset: 'utf8mb4'
  });
  let transaccionIniciada = false;

  try {
    await conexion.beginTransaction();
    transaccionIniciada = true;

    const idsPorCorreo = new Map();
    for (const usuario of usuariosDemo) {
      const hash = await bcrypt.hash(usuario.contrasenia, 12);
      const [resultado] = await conexion.execute(
        `INSERT INTO usuario
          (nombre, correo, contrasenia, telefono, direccion, rol, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVO')
         ON DUPLICATE KEY UPDATE
          id_usuario = LAST_INSERT_ID(id_usuario),
          nombre = VALUES(nombre),
          contrasenia = VALUES(contrasenia),
          telefono = VALUES(telefono),
          direccion = VALUES(direccion),
          rol = VALUES(rol),
          estado = 'ACTIVO'`,
        [
          usuario.nombre,
          usuario.correo,
          hash,
          usuario.telefono,
          usuario.direccion,
          usuario.rol
        ]
      );
      idsPorCorreo.set(usuario.correo, resultado.insertId);
    }

    // La numeración del esquema va de lunes (1) a sábado (6).
    const diasLaborables = [1, 2, 3, 4, 5, 6];
    const especialistas = [
      idsPorCorreo.get('ana.especialista@amys.test'),
      idsPorCorreo.get('sofia.especialista@amys.test')
    ];

    for (const idEspecialista of especialistas) {
      for (const diaSemana of diasLaborables) {
        await conexion.execute(
          `INSERT INTO horario_especialista
            (id_especialista, dia_semana, hora_inicio, hora_fin)
           VALUES (?, ?, '09:00:00', '17:00:00')
           ON DUPLICATE KEY UPDATE hora_fin = VALUES(hora_fin)`,
          [idEspecialista, diaSemana]
        );
      }
    }

    await conexion.commit();
    transaccionIniciada = false;
    console.log('Usuarios demo y horarios de lunes a sábado creados correctamente.');
  } catch (error) {
    if (transaccionIniciada) {
      await conexion.rollback();
    }
    throw error;
  } finally {
    await conexion.end();
  }
}

crearUsuariosDemo().catch((error) => {
  console.error('No fue posible crear los usuarios demo:', error);
  process.exitCode = 1;
});
