(function () {
  const usuario = window.protegerPagina();
  if (!usuario) {
    return;
  }

  const token = window.leerToken();
  const idCita = Number(new URLSearchParams(window.location.search).get('id'));
  const mensaje = document.getElementById('mensajeComprobante');
  const contenido = document.getElementById('contenidoComprobante');
  const botonImprimir = document.getElementById('botonImprimir');
  const botonCancelar = document.getElementById('botonCancelar');
  const notaCancelacion = document.getElementById('notaCancelacion');

  document.getElementById('cerrarSesionComprobante').addEventListener('click', window.cerrarSesion);
  botonImprimir.addEventListener('click', () => window.print());

  function mostrarMensaje(texto, esExito) {
    mensaje.textContent = texto;
    mensaje.classList.toggle('alert-success', esExito);
    mensaje.classList.toggle('alert-danger', !esExito);
    mensaje.classList.remove('d-none');
  }

  function formatearPrecio(precio) {
    return Number(precio).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });
  }

  function formatearFecha(fecha) {
    const partes = String(fecha).slice(0, 10).split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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

  function mostrarCita(cita) {
    document.getElementById('codigoComprobante').textContent = cita.codigo_comprobante;
    const estado = document.getElementById('estadoCita');
    estado.textContent = cita.estado_cita;
    estado.className = cita.estado_cita === 'cancelada'
      ? 'badge text-bg-secondary'
      : cita.estado_cita === 'completada'
        ? 'badge text-bg-success'
        : 'badge text-bg-primary';

    document.getElementById('modalidadCita').textContent = cita.modalidad === 'domicilio'
      ? 'A domicilio'
      : 'En el estudio';
    document.getElementById('fechaCita').textContent = formatearFecha(cita.fecha_cita);
    document.getElementById('horaCita').textContent = `${String(cita.hora_cita).slice(0, 5)} - ${String(cita.hora_fin).slice(0, 5)}`;
    document.getElementById('especialistaCita').textContent = cita.nombre_especialista;

    const contenedorDireccion = document.getElementById('contenedorDireccion');
    if (cita.modalidad === 'domicilio') {
      document.getElementById('direccionCita').textContent = `${cita.direccion_servicio}, ${cita.ciudad}`;
      contenedorDireccion.classList.remove('d-none');
    } else {
      contenedorDireccion.classList.add('d-none');
    }

    const listaServicios = document.getElementById('listaServiciosCita');
    listaServicios.replaceChildren();
    for (const servicio of cita.servicios) {
      const elemento = document.createElement('li');
      elemento.className = 'list-group-item d-flex justify-content-between gap-3 px-0';
      const nombre = document.createElement('span');
      nombre.textContent = servicio.nombre_servicio;
      const subtotal = document.createElement('strong');
      subtotal.textContent = formatearPrecio(servicio.subtotal);
      elemento.append(nombre, subtotal);
      listaServicios.appendChild(elemento);
    }
    document.getElementById('totalCita').textContent = formatearPrecio(cita.total);
    contenido.classList.remove('d-none');
    botonImprimir.classList.remove('d-none');

    const esClientePropietario = usuario.rol === 'cliente'
      && Number(cita.id_cliente) === usuario.id_usuario;
    const estadoCancelable = cita.estado_cita === 'pendiente' || cita.estado_cita === 'confirmada';
    botonCancelar.classList.add('d-none');
    notaCancelacion.classList.add('d-none');
    if (esClientePropietario && estadoCancelable) {
      const fechaHora = new Date(`${String(cita.fecha_cita).slice(0, 10)}T${String(cita.hora_cita).slice(0, 8)}`);
      const horasRestantes = (fechaHora.getTime() - Date.now()) / 3600000;
      if (horasRestantes >= 2) {
        botonCancelar.classList.remove('d-none');
      } else {
        notaCancelacion.textContent = 'Para cancelar una cita deben faltar al menos 2 horas.';
        notaCancelacion.classList.remove('d-none');
      }
    }
  }

  async function cargarCita() {
    if (!Number.isInteger(idCita) || idCita <= 0) {
      throw new Error('El identificador del comprobante no es válido.');
    }
    const datos = await solicitarJson(`/api/citas/${encodeURIComponent(idCita)}`);
    mostrarCita(datos.cita);
    mensaje.classList.add('d-none');
  }

  botonCancelar.addEventListener('click', async () => {
    if (!window.confirm('¿Deseas cancelar esta cita?')) {
      return;
    }

    botonCancelar.disabled = true;
    try {
      const datos = await solicitarJson(`/api/citas/${encodeURIComponent(idCita)}/cancelar`, {
        method: 'PUT'
      });
      await cargarCita();
      mostrarMensaje(datos.mensaje, true);
    } catch (error) {
      mostrarMensaje(error.message, false);
    } finally {
      botonCancelar.disabled = false;
    }
  });

  cargarCita().catch((error) => {
    mostrarMensaje(error.message, false);
  });
}());
