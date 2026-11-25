(function () {
  const usuario = window.protegerPagina(['cliente']);
  if (!usuario) return;

  const token = window.leerToken();
  const proximas = document.getElementById('listaProximas');
  const historial = document.getElementById('listaHistorial');
  const mensaje = document.getElementById('mensajeMisCitas');

  document.getElementById('nombreUsuarioCitas').textContent = `Hola, ${usuario.nombre}`;
  document.getElementById('cerrarSesionMisCitas').addEventListener('click', window.cerrarSesion);

  function mostrarMensaje(texto, esExito) {
    mensaje.textContent = texto;
    mensaje.classList.toggle('alert-success', esExito);
    mensaje.classList.toggle('alert-danger', !esExito);
    mensaje.classList.remove('d-none');
  }

  async function solicitarJson(url, opciones) {
    const configuracion = opciones || {};
    configuracion.headers = {
      ...(configuracion.headers || {}),
      Authorization: `Bearer ${token}`
    };
    if (configuracion.body) configuracion.headers['Content-Type'] = 'application/json';
    const respuesta = await fetch(url, configuracion);
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.mensaje || 'No fue posible completar la solicitud.');
    return datos;
  }

  function formatearFecha(fecha) {
    const partes = String(fecha).slice(0, 10).split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString('es-EC', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function formatoPrecio(precio) {
    return Number(precio).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function etiquetaEstado(estado) {
    const colores = { pendiente: 'text-bg-warning', confirmada: 'text-bg-primary', completada: 'text-bg-success', cancelada: 'text-bg-danger' };
    const etiqueta = document.createElement('span');
    etiqueta.className = `badge ${colores[estado] || 'text-bg-secondary'}`;
    etiqueta.textContent = estado.charAt(0).toUpperCase() + estado.slice(1);
    return etiqueta;
  }

  function crearTarjeta(cita) {
    const col = document.createElement('div');
    col.className = 'col-12 col-lg-6';
    const card = document.createElement('article');
    card.className = 'card admin-card h-100';
    const body = document.createElement('div');
    body.className = 'card-body';

    const encabezado = document.createElement('div');
    encabezado.className = 'd-flex justify-content-between align-items-start gap-3';
    const codigo = document.createElement('strong');
    codigo.className = 'servicio-precio';
    codigo.textContent = cita.codigo;
    encabezado.append(codigo, etiquetaEstado(cita.estado));

    const fecha = document.createElement('h2');
    fecha.className = 'h5 mt-3 mb-1';
    fecha.textContent = `${formatearFecha(cita.fecha)} · ${String(cita.hora).slice(0, 5)} - ${String(cita.hora_fin).slice(0, 5)}`;
    const especialista = document.createElement('p');
    especialista.className = 'text-secondary mb-2';
    especialista.textContent = `Especialista: ${cita.especialista}`;
    const servicios = document.createElement('p');
    servicios.className = 'mb-2';
    servicios.textContent = `Servicios: ${cita.servicios.join(', ')}`;
    const modalidad = document.createElement('p');
    modalidad.className = 'mb-2';
    modalidad.textContent = `Modalidad: ${cita.modalidad === 'domicilio' ? 'A domicilio' : 'En el estudio'}`;
    if (cita.modalidad === 'domicilio') {
      const direccion = document.createElement('p');
      direccion.className = 'text-secondary mb-2';
      direccion.textContent = `${cita.direccion}, ${cita.ciudad || ''}`;
      body.append(encabezado, fecha, especialista, servicios, modalidad, direccion);
    } else {
      body.append(encabezado, fecha, especialista, servicios, modalidad);
    }
    const pie = document.createElement('div');
    pie.className = 'd-flex flex-wrap justify-content-between align-items-center gap-2 border-top pt-3';
    const total = document.createElement('strong');
    total.text = '';
    total.textContent = `Total: ${formatoPrecio(cita.total)}`;
    const acciones = document.createElement('div');
    acciones.className = 'd-flex gap-2';
    const comprobante = document.createElement('a');
    comprobante.className = 'btn btn-sm btn-outline-primary';
    comprobante.href = `/comprobante.html?id=${encodeURIComponent(cita.id_cita)}`;
    comprobante.textContent = 'Ver comprobante';
    acciones.appendChild(comprobante);

    if (cita.estado === 'pendiente' || cita.estado === 'confirmada') {
      const inicio = new Date(`${String(cita.fecha).slice(0, 10)}T${String(cita.hora).slice(0, 8)}`);
      if ((inicio.getTime() - Date.now()) / 3600000 >= 2) {
        const cancelar = document.createElement('button');
        cancelar.type = 'button';
        cancelar.className = 'btn btn-sm btn-outline-danger';
        cancelar.textContent = 'Cancelar';
        cancelar.addEventListener('click', () => cancelarCita(cita, cancelar));
        acciones.appendChild(cancelar);
      }
    }
    pie.append(total, acciones);
    body.appendChild(pie);
    card.appendChild(body);
    col.appendChild(card);
    return col;
  }

  async function cancelarCita(cita, boton) {
    if (!window.confirm('¿Deseas cancelar esta cita?')) return;
    boton.disabled = true;
    try {
      const datos = await solicitarJson(`/api/citas/${encodeURIComponent(cita.id_cita)}/cancelar`, { method: 'PUT' });
      mostrarMensaje(datos.mensaje, true);
      await cargarCitas();
    } catch (error) {
      mostrarMensaje(error.message, false);
      boton.disabled = false;
    }
  }

  async function cargarCitas() {
    try {
      const datos = await solicitarJson('/api/citas/mias');
      proximas.replaceChildren();
      historial.replaceChildren();
      let cantidadProximas = 0;
      let cantidadHistorial = 0;
      for (const cita of datos.citas) {
        const inicio = new Date(`${String(cita.fecha).slice(0, 10)}T${String(cita.hora).slice(0, 8)}`);
        const esFutura = inicio.getTime() >= Date.now() && cita.estado !== 'completada' && cita.estado !== 'cancelada';
        if (esFutura) {
          proximas.appendChild(crearTarjeta(cita));
          cantidadProximas++;
        } else {
          historial.appendChild(crearTarjeta(cita));
          cantidadHistorial++;
        }
      }
      if (cantidadProximas === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'text-secondary';
        vacio.textContent = 'No tienes citas próximas.';
        proximas.appendChild(vacio);
      }
      if (cantidadHistorial === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'text-secondary';
        vacio.textContent = 'No tienes citas en el historial.';
        historial.appendChild(vacio);
      }
      mensaje.classList.add('d-none');
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  cargarCitas();
}());
