(function () {
  const usuario = window.protegerPagina(['cliente']);
  if (!usuario) {
    return;
  }

  const parametrosUrl = new URLSearchParams(window.location.search);
  const idServicioInicial = Number(parametrosUrl.get('servicio'));
  const token = window.leerToken();
  const formulario = document.getElementById('formReserva');
  const selectorEspecialista = document.getElementById('especialista');
  const selectorFecha = document.getElementById('fechaCita');
  const selectorHora = document.getElementById('horaCita');
  const opcionesServicios = document.getElementById('opcionesServicios');
  const estadoDisponibilidad = document.getElementById('estadoDisponibilidad');
  const mensaje = document.getElementById('mensajeReserva');
  const botonReservar = document.getElementById('botonReservar');
  const camposDomicilio = document.getElementById('camposDomicilio');
  const selectorCiudad = document.getElementById('ciudad');
  const campoDireccion = document.getElementById('direccionServicio');
  const serviciosPorId = new Map();
  let solicitudDisponibilidad = 0;

  document.getElementById('cerrarSesionReserva').addEventListener('click', window.cerrarSesion);

  function formatearFechaLocal(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  function formatearPrecio(precio) {
    return Number(precio).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });
  }

  function mostrarMensaje(texto, esExito) {
    mensaje.textContent = texto;
    mensaje.classList.toggle('alert-success', esExito);
    mensaje.classList.toggle('alert-danger', !esExito);
    mensaje.classList.remove('d-none');
  }

  function ocultarMensaje() {
    mensaje.classList.add('d-none');
  }

  async function solicitarJson(url, opciones) {
    const configuracion = opciones || {};
    configuracion.headers = {
      ...(configuracion.headers || {}),
      Authorization: `Bearer ${token}`
    };
    if (configuracion.body) {
      configuracion.headers['Content-Type'] = 'application/json';
    }

    const respuesta = await fetch(url, configuracion);
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(datos.mensaje || 'No fue posible completar la solicitud.');
    }
    return datos;
  }

  function obtenerServiciosSeleccionados() {
    return Array.from(opcionesServicios.querySelectorAll('input[type="checkbox"]:checked'))
      .map((casilla) => serviciosPorId.get(Number(casilla.value)))
      .filter(Boolean);
  }

  function actualizarResumen() {
    const servicios = obtenerServiciosSeleccionados();
    const duracion = servicios.reduce((total, servicio) => total + Number(servicio.duracion_minutos), 0);
    const precio = servicios.reduce((total, servicio) => total + Number(servicio.precio), 0);
    document.getElementById('duracionTotal').textContent = `${duracion} minutos`;
    document.getElementById('precioTotal').textContent = formatearPrecio(precio);
  }

  function agregarOpcionServicio(servicio, esInicial) {
    const contenedor = document.createElement('label');
    contenedor.className = 'form-check border rounded-3 p-3 ps-5';

    const casilla = document.createElement('input');
    casilla.className = 'form-check-input';
    casilla.type = 'checkbox';
    casilla.value = servicio.id_servicio;
    casilla.checked = esInicial;
    casilla.disabled = esInicial;
    casilla.addEventListener('change', () => {
      ocultarMensaje();
      actualizarResumen();
      cargarDisponibilidad(true);
    });

    const texto = document.createElement('span');
    texto.className = 'd-block fw-medium';
    texto.textContent = servicio.nombre_servicio;

    const detalle = document.createElement('span');
    detalle.className = 'small text-secondary';
    detalle.textContent = `${formatearPrecio(servicio.precio)} · ${servicio.duracion_minutos} minutos${esInicial ? ' · Seleccionado' : ''}`;

    contenedor.append(casilla, texto, detalle);
    opcionesServicios.appendChild(contenedor);
  }

  function actualizarModalidad() {
    const esDomicilio = document.getElementById('modalidadDomicilio').checked;
    camposDomicilio.classList.toggle('d-none', !esDomicilio);
    selectorCiudad.disabled = !esDomicilio;
    selectorCiudad.required = esDomicilio;
    campoDireccion.disabled = !esDomicilio;
    campoDireccion.required = esDomicilio;
    ocultarMensaje();
    cargarDisponibilidad(true);
  }

  async function cargarDisponibilidad(preservarHora, mostrarError) {
    const numeroSolicitud = ++solicitudDisponibilidad;
    const horaAnterior = preservarHora ? selectorHora.value : '';
    const servicios = obtenerServiciosSeleccionados();
    const fecha = selectorFecha.value;
    const idEspecialista = selectorEspecialista.value;
    const modalidad = document.querySelector('input[name="modalidad"]:checked').value;

    selectorHora.replaceChildren(new Option('Selecciona una hora disponible', ''));
    selectorHora.disabled = true;
    if (servicios.length === 0 || !fecha || !idEspecialista) {
      estadoDisponibilidad.textContent = 'Selecciona servicios, especialista y fecha para consultar las horas.';
      return;
    }

    const duracion = servicios.reduce(
      (total, servicio) => total + Number(servicio.duracion_minutos),
      0
    );
    const parametros = new URLSearchParams({
      id_especialista: idEspecialista,
      fecha,
      duracion: String(duracion),
      modalidad
    });
    estadoDisponibilidad.textContent = 'Consultando horas disponibles...';

    try {
      const datos = await solicitarJson(`/api/disponibilidad?${parametros.toString()}`);
      if (numeroSolicitud !== solicitudDisponibilidad) {
        return;
      }

      if (datos.horas_disponibles.length === 0) {
        estadoDisponibilidad.textContent = 'No hay horas libres para esa selección. Prueba otra fecha o especialista.';
        return;
      }

      for (const hora of datos.horas_disponibles) {
        selectorHora.add(new Option(hora, hora));
      }
      selectorHora.disabled = false;
      if (horaAnterior && datos.horas_disponibles.includes(horaAnterior)) {
        selectorHora.value = horaAnterior;
      }
      estadoDisponibilidad.textContent = `${datos.horas_disponibles.length} hora(s) disponible(s).`;
    } catch (error) {
      if (numeroSolicitud !== solicitudDisponibilidad) {
        return;
      }
      estadoDisponibilidad.textContent = 'No se pudo consultar la disponibilidad.';
      if (mostrarError !== false) {
        mostrarMensaje(error.message, false);
      }
    }
  }

  async function cargarDatosIniciales() {
    if (!Number.isInteger(idServicioInicial) || idServicioInicial <= 0) {
      throw new Error('No se indicó un servicio válido para iniciar la reserva.');
    }

    const [datosServicios, datosEspecialistas] = await Promise.all([
      solicitarJson('/api/servicios'),
      solicitarJson('/api/especialistas')
    ]);
    for (const servicio of datosServicios.servicios) {
      serviciosPorId.set(Number(servicio.id_servicio), servicio);
    }

    const servicioInicial = serviciosPorId.get(idServicioInicial);
    if (!servicioInicial) {
      throw new Error('El servicio seleccionado ya no está disponible. Vuelve al catálogo.');
    }
    document.getElementById('servicioBase').textContent = `${servicioInicial.nombre_servicio} · ${formatearPrecio(servicioInicial.precio)} · ${servicioInicial.duracion_minutos} minutos`;

    for (const servicio of datosServicios.servicios) {
      agregarOpcionServicio(servicio, Number(servicio.id_servicio) === idServicioInicial);
    }

    for (const especialista of datosEspecialistas.especialistas) {
      selectorEspecialista.add(new Option(especialista.nombre, especialista.id_usuario));
    }
    if (datosEspecialistas.especialistas.length === 0) {
      throw new Error('Todavía no hay especialistas activos con horarios registrados.');
    }

    const hoy = new Date();
    const fechaMaxima = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    fechaMaxima.setDate(fechaMaxima.getDate() + 60);
    selectorFecha.min = formatearFechaLocal(hoy);
    selectorFecha.max = formatearFechaLocal(fechaMaxima);
    actualizarResumen();
    await cargarDisponibilidad(false);
  }

  selectorEspecialista.addEventListener('change', () => {
    ocultarMensaje();
    cargarDisponibilidad(false);
  });
  selectorFecha.addEventListener('change', () => {
    ocultarMensaje();
    cargarDisponibilidad(false);
  });
  document.querySelectorAll('input[name="modalidad"]').forEach((opcion) => {
    opcion.addEventListener('change', actualizarModalidad);
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) {
      return;
    }

    const servicios = obtenerServiciosSeleccionados();
    if (servicios.length === 0 || !selectorHora.value) {
      mostrarMensaje('Selecciona al menos un servicio y una hora disponible.', false);
      return;
    }

    const esDomicilio = document.getElementById('modalidadDomicilio').checked;
    const cuerpo = {
      id_servicios: servicios.map((servicio) => Number(servicio.id_servicio)),
      id_especialista: Number(selectorEspecialista.value),
      fecha_cita: selectorFecha.value,
      hora_cita: selectorHora.value,
      modalidad: esDomicilio ? 'domicilio' : 'estudio',
      ciudad: esDomicilio ? selectorCiudad.value : null,
      direccion_servicio: esDomicilio ? campoDireccion.value.trim() : null
    };

    botonReservar.disabled = true;
    ocultarMensaje();
    try {
      const datos = await solicitarJson('/api/citas', {
        method: 'POST',
        body: JSON.stringify(cuerpo)
      });
      window.location.assign(`/comprobante.html?id=${encodeURIComponent(datos.cita.id_cita)}`);
    } catch (error) {
      await cargarDisponibilidad(true, false);
      mostrarMensaje(error.message, false);
    } finally {
      botonReservar.disabled = false;
    }
  });

  cargarDatosIniciales().catch((error) => {
    mostrarMensaje(error.message, false);
    document.getElementById('servicioBase').textContent = 'No fue posible cargar el servicio.';
  });
}());
