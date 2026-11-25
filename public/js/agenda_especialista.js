(function () {
  const usuario = window.protegerPagina(['especialista']);
  if (!usuario) return;

  const token = window.leerToken();
  const lista = document.getElementById('listaAgendaEspecialista');
  const mensaje = document.getElementById('mensajeAgendaEspecialista');
  const fecha = document.getElementById('fechaEspecialista');
  const diaria = document.getElementById('vistaDiaria');
  const semanal = document.getElementById('vistaSemanal');
  let modo = 'dia';

  document.getElementById('nombreUsuario').textContent = `Hola, ${usuario.nombre}`;
  document.getElementById('cerrarSesionEspecialista').addEventListener('click', window.cerrarSesion);

  function hoyLocal(sumaDias) {
    const ahora = new Date();
    ahora.setDate(ahora.getDate() + (sumaDias || 0));
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  }

  function formatearFecha(fechaTexto) {
    const partes = String(fechaTexto).slice(0, 10).split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString('es-EC', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function mostrarMensaje(texto, esExito) {
    mensaje.textContent = texto;
    mensaje.classList.toggle('alert-success', esExito);
    mensaje.classList.toggle('alert-danger', !esExito);
    mensaje.classList.remove('d-none');
  }

  async function solicitarJson(url, opciones) {
    const configuracion = opciones || {};
    configuracion.headers = { ...(configuracion.headers || {}), Authorization: `Bearer ${token}` };
    if (configuracion.body) configuracion.headers['Content-Type'] = 'application/json';
    const respuesta = await fetch(url, configuracion);
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.mensaje || 'No fue posible completar la solicitud.');
    return datos;
  }

  function etiquetaEstado(estado) {
    const colores = { pendiente: 'text-bg-warning', confirmada: 'text-bg-primary', completada: 'text-bg-success', cancelada: 'text-bg-danger' };
    const etiqueta = document.createElement('span');
    etiqueta.className = `badge ${colores[estado] || 'text-bg-secondary'}`;
    etiqueta.textContent = estado.charAt(0).toUpperCase() + estado.slice(1);
    return etiqueta;
  }

  async function cambiarEstado(cita, nuevoEstado) {
    try {
      const datos = await solicitarJson(`/api/citas/${encodeURIComponent(cita.id_cita)}/estado`, {
        method: 'PUT',
        body: JSON.stringify({ estado: nuevoEstado })
      });
      mostrarMensaje(datos.mensaje, true);
      await cargarAgenda();
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  function crearTarjeta(cita) {
    const col = document.createElement('div');
    col.className = 'col-12';
    const card = document.createElement('article');
    card.className = 'card admin-card cita-tarjeta';
    const body = document.createElement('div');
    body.className = 'card-body';
    const encabezado = document.createElement('div');
    encabezado.className = 'd-flex justify-content-between align-items-start gap-3';
    const hora = document.createElement('h2');
    hora.className = 'h5 mb-0';
    hora.textContent = `${String(cita.hora).slice(0, 5)} - ${String(cita.hora_fin).slice(0, 5)} · ${formatearFecha(cita.fecha)}`;
    encabezado.append(hora, etiquetaEstado(cita.estado));

    const cliente = document.createElement('p');
    cliente.className = 'mt-3 mb-1';
    cliente.textContent = `Cliente: ${cita.cliente.nombre} · ${cita.cliente.telefono || 'Sin teléfono'}`;
    const servicios = document.createElement('p');
    servicios.className = 'mb-1';
    servicios.textContent = `Servicios: ${cita.servicios.join(', ')}`;
    const modalidad = document.createElement('p');
    modalidad.className = 'mb-3';
    modalidad.textContent = cita.modalidad === 'domicilio'
      ? `A domicilio · ${cita.direccion || ''}${cita.ciudad ? `, ${cita.ciudad}` : ''}`
      : 'En el estudio';
    body.append(encabezado, cliente, servicios, modalidad);

    if (cita.estado === 'pendiente') {
      const confirmar = document.createElement('button');
      confirmar.type = 'button';
      confirmar.className = 'btn btn-sm btn-primary';
      confirmar.textContent = 'Confirmar';
      confirmar.addEventListener('click', () => cambiarEstado(cita, 'confirmada'));
      body.appendChild(confirmar);
    } else if (cita.estado === 'confirmada') {
      const completar = document.createElement('button');
      completar.type = 'button';
      completar.className = 'btn btn-sm btn-success';
      completar.textContent = 'Completar';
      completar.addEventListener('click', () => cambiarEstado(cita, 'completada'));
      body.appendChild(completar);
    }
    card.appendChild(body);
    col.appendChild(card);
    return col;
  }

  async function cargarAgenda() {
    const parametros = new URLSearchParams();
    if (modo === 'dia') parametros.set('fecha', fecha.value);
    else {
      const inicio = new Date(`${fecha.value}T00:00:00`);
      const dia = inicio.getDay();
      inicio.setDate(inicio.getDate() + (dia === 0 ? -6 : 1 - dia));
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      const texto = (valor) => `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
      parametros.set('desde', texto(inicio));
      parametros.set('hasta', texto(fin));
    }
    lista.textContent = 'Cargando agenda...';
    try {
      const datos = await solicitarJson(`/api/citas/agenda?${parametros}`);
      lista.replaceChildren();
      if (datos.citas.length === 0) {
        lista.innerHTML = '<div class="text-secondary">No tienes citas en este período.</div>';
        return;
      }
      for (const cita of datos.citas) lista.appendChild(crearTarjeta(cita));
      mensaje.classList.add('d-none');
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  diaria.addEventListener('click', () => {
    modo = 'dia';
    diaria.className = 'btn btn-primary';
    semanal.className = 'btn btn-outline-primary';
    cargarAgenda();
  });
  semanal.addEventListener('click', () => {
    modo = 'semana';
    diaria.className = 'btn btn-outline-primary';
    semanal.className = 'btn btn-primary';
    cargarAgenda();
  });
  fecha.addEventListener('change', cargarAgenda);
  fecha.value = hoyLocal(0);
  cargarAgenda();
}());
