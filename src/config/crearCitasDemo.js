const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function convertirHora(hora) {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

function formatearHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}:00`;
}

function fechaLocal(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

async function crearCitasDemo() {
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

    const [clientes] = await conexion.execute(
      `SELECT id_usuario
       FROM usuario
       WHERE rol = ? AND estado = ?
       ORDER BY id_usuario`,
      ['cliente', 'ACTIVO']
    );
    const [especialistas] = await conexion.execute(
      `SELECT id_usuario
       FROM usuario
       WHERE rol = ? AND estado = ?
       ORDER BY id_usuario`,
      ['especialista', 'ACTIVO']
    );
    const [servicios] = await conexion.execute(
      `SELECT id_servicio, nombre_servicio, precio, duracion_minutos
       FROM servicio
       WHERE estado = ?
       ORDER BY id_servicio`,
      ['ACTIVO']
    );

    if (clientes.length === 0 || especialistas.length === 0 || servicios.length === 0) {
      throw new Error('Debes tener clientes, especialistas y servicios activos antes de ejecutar el script.');
    }

    const [codigosExistentes] = await conexion.execute(
      'SELECT codigo_comprobante FROM cita'
    );
    const usados = new Set(codigosExistentes.map((fila) => fila.codigo_comprobante));
    let insertadas = 0;
    let consecutivo = 1001;

    for (let indice = 0; indice < 28; indice++) {
      const haceDias = 1 + ((indice * 7 + indice % 5) % 45);
      const fecha = new Date();
      fecha.setHours(12, 0, 0, 0);
      fecha.setDate(fecha.getDate() - haceDias);
      const fechaTexto = fechaLocal(fecha);

      const especialista = especialistas[indice % especialistas.length];
      const cliente = clientes[(indice * 3 + 1) % clientes.length];

      const seleccionados = [];
      seleccionados.push(servicios[indice % servicios.length]);
      if (indice % 3 === 0 || servicios.length > 1) {
        seleccionados.push(servicios[(indice * 2 + 3) % servicios.length]);
      }
      if (indice % 7 === 0 && servicios.length > 2) {
        seleccionados.push(servicios[(indice + 5) % servicios.length]);
      }
      const idsUnicos = Array.from(new Map(
        seleccionados.map((servicio) => [servicio.id_servicio, servicio])
      ).values());

      const duracion = idsUnicos.reduce(
        (total, servicio) => total + Number(servicio.duracion_minutos),
        0
      );

      let horaInicio = 9 * 60 + ((indice * 60) % 420);
      horaInicio = Math.round(horaInicio / 30) * 30;
      let horaFin = horaInicio + duracion;
      if (horaFin > 17 * 60) {
        horaInicio = 16 * 60 - duracion;
        if (horaInicio < 9 * 60) horaInicio = 9 * 60;
        horaFin = horaInicio + duracion;
      }

      const [ocupadas] = await conexion.execute(
        `SELECT hora_cita, hora_fin
         FROM cita
         WHERE id_especialista = ? AND fecha_cita = ? AND estado_cita <> ?
         ORDER BY hora_cita`,
        [especialista.id_usuario, fechaTexto, 'cancelada']
      );
      let conflicto = true;
      let intentos = 0;
      while (conflicto && intentos < 16) {
        conflicto = ocupadas.some((cita) => (
          horaInicio < convertirHora(String(cita.hora_fin).slice(0, 5))
          && horaFin > convertirHora(String(cita.hora_cita).slice(0, 5))
        ));
        if (conflicto) {
          horaInicio += 30;
          horaFin = horaInicio + duracion;
          if (horaFin > 17 * 60) {
            horaInicio = 9 * 60;
            horaFin = horaInicio + duracion;
          }
        }
        intentos++;
      }
      if (conflicto) continue;

      const modalidad = indice % 2 === 0 ? 'estudio' : 'domicilio';
      const ciudad = indice % 3 === 0 ? 'Ibarra' : 'Otavalo';
      const direccion = modalidad === 'domicilio'
        ? 'Av. Centro Histórico y calles principales'
        : null;
      const total = idsUnicos.reduce(
        (suma, servicio) => suma + Number(servicio.precio),
        0
      ).toFixed(2);

      let codigo;
      do {
        const partesFecha = fechaTexto.replace(/-/g, '');
        codigo = `ASB-${partesFecha}-${String(consecutivo).padStart(4, '0')}`;
        consecutivo++;
      } while (usados.has(codigo));
      usados.add(codigo);

      const [resultado] = await conexion.execute(
        `INSERT INTO cita
          (id_cliente, id_especialista, fecha_cita, hora_cita, hora_fin,
           modalidad, ciudad, direccion_servicio, estado_cita,
           codigo_comprobante, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completada', ?, ?)`,
        [
          cliente.id_usuario,
          especialista.id_usuario,
          fechaTexto,
          formatearHora(horaInicio),
          formatearHora(horaFin),
          modalidad,
          modalidad === 'domicilio' ? ciudad : null,
          direccion,
          codigo,
          total
        ]
      );

      for (const servicio of idsUnicos) {
        await conexion.execute(
          `INSERT INTO detalle_cita (id_cita, id_servicio, subtotal)
           VALUES (?, ?, ?)`,
          [resultado.insertId, servicio.id_servicio, Number(servicio.precio).toFixed(2)]
        );
      }
      insertadas++;
    }

    await conexion.commit();
    transaccionIniciada = false;
    console.log(`Se insertaron ${insertadas} citas de demostración completadas.`);
  } catch (error) {
    if (transaccionIniciada) await conexion.rollback();
    console.error('No fue posible crear las citas demo:', error.message);
    process.exitCode = 1;
  } finally {
    await conexion.end();
  }
}

crearCitasDemo();
