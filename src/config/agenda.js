const {
  INTERVALO_MIN,
  MARGEN_TRASLADO_MIN,
  ANTICIPACION_MIN_RESERVA_MIN,
  DIAS_MAX_ADELANTE
} = require('./reglas');

function analizarFecha(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return null;
  }

  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(fechaUtc.getTime()) || fechaUtc.toISOString().slice(0, 10) !== fecha) {
    return null;
  }

  return {
    texto: fecha,
    anio: fechaUtc.getUTCFullYear(),
    mes: fechaUtc.getUTCMonth(),
    dia: fechaUtc.getUTCDate(),
    diaSemana: ((fechaUtc.getUTCDay() + 6) % 7) + 1,
    numeroDia: fechaUtc.getTime() / 86400000
  };
}

function validarFechaReserva(fecha, ahora) {
  const partes = analizarFecha(fecha);
  if (!partes) {
    return { error: 'Ingresa una fecha válida con formato AAAA-MM-DD.' };
  }

  const instanteActual = ahora || new Date();
  const numeroDiaHoy = Date.UTC(
    instanteActual.getFullYear(),
    instanteActual.getMonth(),
    instanteActual.getDate()
  ) / 86400000;
  const diasAdelante = partes.numeroDia - numeroDiaHoy;

  if (diasAdelante < 0) {
    return { error: 'No se pueden reservar fechas pasadas.' };
  }
  if (diasAdelante > DIAS_MAX_ADELANTE) {
    return { error: `Solo se pueden reservar citas hasta ${DIAS_MAX_ADELANTE} días adelante.` };
  }

  return { partes, diasAdelante };
}

function convertirHoraEnMinutos(hora) {
  let texto = hora;
  if (hora instanceof Date) {
    texto = `${String(hora.getHours()).padStart(2, '0')}:${String(hora.getMinutes()).padStart(2, '0')}:${String(hora.getSeconds()).padStart(2, '0')}`;
  }
  if (typeof texto !== 'string') {
    return null;
  }

  const coincidencia = texto.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/);
  if (!coincidencia) {
    return null;
  }

  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  const segundos = Number(coincidencia[3] || 0);
  if (horas > 24 || (horas === 24 && (minutos !== 0 || segundos !== 0)) || segundos !== 0) {
    return null;
  }
  return horas * 60 + minutos;
}

function formatearHora(minutosDelDia) {
  const horas = Math.floor(minutosDelDia / 60);
  const minutos = minutosDelDia % 60;
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function crearFechaHoraLocal(fecha, hora) {
  const partesFecha = analizarFecha(fecha);
  const minutosDelDia = convertirHoraEnMinutos(hora);
  if (!partesFecha || minutosDelDia === null) {
    return null;
  }

  return new Date(
    partesFecha.anio,
    partesFecha.mes,
    partesFecha.dia,
    Math.floor(minutosDelDia / 60),
    minutosDelDia % 60,
    0,
    0
  );
}

function crearErrorHora(origen, valor) {
  return new Error(`La hora ${valor} de ${origen} no es válida.`);
}

async function calcularHorasDisponibles(conexion, opciones) {
  const { idEspecialista, fecha, duracion, modalidad } = opciones;
  const partesFecha = analizarFecha(fecha);
  if (!partesFecha) {
    throw new Error('La fecha de reserva no es válida.');
  }

  const [bloques] = await conexion.execute(
    `SELECT hora_inicio, hora_fin
     FROM horario_especialista
     WHERE id_especialista = ? AND dia_semana = ?
     ORDER BY hora_inicio`,
    [idEspecialista, partesFecha.diaSemana]
  );
  if (bloques.length === 0) {
    return [];
  }

  const [citas] = await conexion.execute(
    `SELECT hora_cita, hora_fin, modalidad
     FROM cita
     WHERE id_especialista = ? AND fecha_cita = ? AND estado_cita <> ?`,
    [idEspecialista, fecha, 'cancelada']
  );

  const bloquesMinutos = bloques.map((bloque) => {
    const inicio = convertirHoraEnMinutos(bloque.hora_inicio);
    const fin = convertirHoraEnMinutos(bloque.hora_fin);
    if (inicio === null) {
      throw crearErrorHora('del horario', bloque.hora_inicio);
    }
    if (fin === null || fin <= inicio) {
      throw crearErrorHora('de fin del horario', bloque.hora_fin);
    }
    return { inicio, fin };
  });

  const citasMinutos = citas.map((cita) => {
    const inicio = convertirHoraEnMinutos(cita.hora_cita);
    const fin = convertirHoraEnMinutos(cita.hora_fin);
    if (inicio === null) {
      throw crearErrorHora('de una cita existente', cita.hora_cita);
    }
    if (fin === null || fin <= inicio) {
      throw crearErrorHora('de fin de una cita existente', cita.hora_fin);
    }
    const margen = cita.modalidad === 'domicilio' ? MARGEN_TRASLADO_MIN : 0;
    return {
      inicio: inicio - margen,
      fin: fin + margen
    };
  });

  const ahora = opciones.ahora || new Date();
  const anticipacionMinima = ahora.getTime() + ANTICIPACION_MIN_RESERVA_MIN * 60000;
  const margenNuevo = modalidad === 'domicilio' ? MARGEN_TRASLADO_MIN : 0;
  const horasDisponibles = new Set();

  for (const bloque of bloquesMinutos) {
    for (let inicio = bloque.inicio; inicio + duracion <= bloque.fin; inicio += INTERVALO_MIN) {
      const instanteInicio = crearFechaHoraLocal(fecha, formatearHora(inicio));
      if (instanteInicio.getTime() < anticipacionMinima) {
        continue;
      }

      const inicioConMargen = inicio - margenNuevo;
      const finConMargen = inicio + duracion + margenNuevo;
      const tieneConflicto = citasMinutos.some((cita) => (
        inicioConMargen < cita.fin && finConMargen > cita.inicio
      ));
      if (!tieneConflicto) {
        horasDisponibles.add(formatearHora(inicio));
      }
    }
  }

  return Array.from(horasDisponibles).sort((horaA, horaB) => (
    convertirHoraEnMinutos(horaA) - convertirHoraEnMinutos(horaB)
  ));
}

module.exports = {
  analizarFecha,
  validarFechaReserva,
  convertirHoraEnMinutos,
  formatearHora,
  crearFechaHoraLocal,
  calcularHorasDisponibles
};
