(function () {
  const usuario = window.protegerPagina(['administrador', 'recepcionista']);
  if (!usuario) return;

  const token = window.leerToken();
  const filas = document.getElementById('filasAgenda');
  const filtroEspecialista = document.getElementById('filtroEspecialista');
  const filtroEstado = document.getElementById('filtroEstado');
  const fechaAgenda = document.getElementById('fechaAgenda');
  const mensaje = document.getElementById('mensajeAgenda');
  const modalElemento = document.getElementById('modalCitaManual');
  const modal = new bootstrap.Modal(modalElemento);
  const formulario = document.getElementById('formCitaManual');
  const serviciosManual = document.getElementById('serviciosManual');
  const especialistaManual = document.getElementById('especialistaManual');
  const fechaManual = document.getElementById('fechaManual');
  const modalidadManual = document.getElementById('modalidadManual');
  const horaManual = document.getElementById('horaManual');
  let modoFiltro = 'dia';
  let servicioDatos = [];
  let especialistaDatos = [];

  document.getElementById('nombreUsuario').textContent = `${usuario.nombre} · ${usuario.rol}`;
  document.getElementById('cerrarSesionAdmin').addEventListener('click', window.cerrarSesion);
  if (usuario.rol === 'administrador') {
    document.getElementById('enlaceCatalogo').classList.remove('d-none');
    document.getElementById('enlaceHorarios').classList.remove('d-none');
  } else {
    document.getElementById('enlaceReportes').textContent = 'Reporte diario';
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

  function hoyLocal(sumaDias) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + (sumaDias || 0));
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  }

  function formatearFecha(fecha) {
    const partes = String(fecha).slice(0, 10).split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString('es-EC', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  }

  function formatoPrecio(precio) {
    return Number(precio).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  async function cargarResumen() {
    try {
      const datos = await solicitarJson('/api/citas/resumen-hoy');
      document.getElementById('resumenPendiente').textContent = datos.pendiente ?? datos.conteo_por_estado?.pendiente ?? 0;
      document.getElementById('resumenConfirmada').textContent = datos.confirmada ?? datos.conteo_por_estado?.confirmada ?? 0;
      document.getElementById('resumenCompletada').textContent = datos.completada ?? datos.conteo_por_estado?.completada ?? 0;
      document.getElementById('resumenCancelada').textContent = datos.cancelada ?? datos.conteo_por_estado?.cancelada ?? 0;
      document.getElementById('resumenTotal').textContent = datos.total_citas ?? datos.total ?? 0;
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  function etiquetaEstado(estado) {
    const etiqueta = document.createElement('span');
    const clases = { pendiente: 'text-bg-warning', confirmada: 'text-bg-primary', completada: 'text-bg-success', cancelada: 'text-bg-danger' };
    etiqueta.className = `badge ${clases[estado] || 'text-bg-secondary'}`;
    etiqueta.textContent = estado.charAt(0).toUpperCase() + estado.slice(1);
    return etiqueta;
  }

  async function cambiarEstado(cita, nuevoEstado) {
    if (nuevoEstado === 'cancelada' && !window.confirm(`¿Deseas cancelar la cita ${cita.codigo}?`)) return;
    try {
      const datos = await solicitarJson(`/api/citas/${encodeURIComponent(cita.id_cita)}/estado`, {
        method: 'PUT',
        body: JSON.stringify({ estado: nuevoEstado })
      });
      mostrarMensaje(datos.mensaje, true);
      await Promise.all([cargarResumen(), cargarAgenda()]);
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  function crearAcciones(cita) {
    const contenedor = document.createElement('div');
    contenedor.className = 'd-flex flex-wrap gap-1';
    if (cita.estado === 'pendiente') {
      const confirmar = document.createElement('button');
      confirmar.type = 'button';
      confirmar.className = 'btn btn-sm btn-outline-primary';
      confirmar.textContent = 'Confirmar';
      confirmar.addEventListener('click', () => cambiarEstado(cita, 'confirmada'));
      contenedor.appendChild(confirmar);
      const cancelar = document.createElement('button');
      cancelar.type = 'button';
      cancelar.className = 'btn btn-sm btn-outline-danger';
      cancelar.textContent = 'Cancelar';
      cancelar.addEventListener('click', () => cambiarEstado(cita, 'cancelada'));
      contenedor.appendChild(cancelar);
    } else if (cita.estado === 'confirmada') {
      const completar = document.createElement('button');
      completar.type = 'button';
      completar.className = 'btn btn-sm btn-outline-success';
      completar.textContent = 'Completar';
      completar.addEventListener('click', () => cambiarEstado(cita, 'completada'));
      contenedor.appendChild(completar);
      const cancelar = document.createElement('button');
      cancelar.type = 'button';
      cancelar.className = 'btn btn-sm btn-outline-danger';
      cancelar.textContent = 'Cancelar';
      cancelar.addEventListener('click', () => cambiarEstado(cita, 'cancelada'));
      contenedor.appendChild(cancelar);
    }
    return contenedor;
  }

  function crearFila(cita) {
    const fila = document.createElement('tr');
    const valores = [
      `${String(cita.hora).slice(0, 5)}${cita.hora_fin ? ` - ${String(cita.hora_fin).slice(0, 5)}` : ''}`,
      `${cita.cliente.nombre}${cita.cliente.telefono ? `<${'|'}${cita.cliente.telefono}>` : ''}`,
      cita.servicios.join(', ')
    ];
    for (const valor of valores) {
      const celda = document.createElement('td');
      if (valor.includes('<|')) celda.innerHTML = valor.replace('<|', '<br><span class="small text-secondary">').replace('>', '</span>');
      else celda.textContent = valor;
      fila.appendChild(celda);
    }
    const modalidad = document.createElement('td');
    modalidad.textContent = cita.modalidad === 'domicilio'
      ? `Domicilio${cita.direccion ? ` · ${cita.direccion}, ${cita.ciudad || ''}` : ''}`
      : 'Estudio';
    fila.appendChild(modalidad);
    const especialista = document.createElement('td');
    especialista.textContent = cita.especialista;
    fila.appendChild(especialista);
    const estado = document.createElement('td');
    estado.appendChild(etiquetaEstado(cita.estado));
    fila.appendChild(estado);
    const acciones = document.createElement('td');
    acciones.appendChild(crearAcciones(cita));
    fila.appendChild(acciones);
    return fila;
  }

  async function cargarAgenda() {
    const parametros = new URLSearchParams();
    if (modoFiltro === 'dia' && fechaAgenda.value) parametros.set('fecha', fechaAgenda.value);
    if (modoFiltro === 'desdeHasta') {
      const inicio = window.inicioSemana || hoyLocal(0);
      const fin = window.finSemana || inicio;
      parametros.set('desde', inicio);
      parametros.set('hasta', fin);
    }
    if (filtroEspecialista.value) parametros.set('id_especialista', filtroEspecialista.value);
    if (filtroEstado.value) parametros.set('estado', filtroEstado.value);
    filas.innerHTML = '<tr><td colspan="7" class="text-center text-secondary py-4">Cargando agenda...</td></tr>';
    try {
      const datos = await solicitarJson(`/api/citas/agenda${parametros.toString() ? `?${parametros}` : ''}`);
      filas.replaceChildren();
      if (datos.citas.length === 0) {
        filas.innerHTML = '<tr><td colspan="7" class="text-center text-secondary py-4">No hay citas para los filtros seleccionados.</td></tr>';
        return;
      }
      for (const cita of datos.citas) filas.appendChild(crearFila(cita));
    } catch (error) {
      mostrarMensaje(error.message, false);
      filas.innerHTML = '<tr><td colspan="7" class="text-center text-secondary py-4">No fue posible cargar la agenda.</td></tr>';
    }
  }

  async function cargarEspecialistas() {
    const datos = await solicitarJson('/api/especialistas');
    especialistaDatos = datos.especialistas;
    for (const especialista of especialistaDatos) {
      const opcionFiltro = document.createElement('option');
      opcionFiltro.value = especialista.id_usuario;
      opcionFiltro.textContent = especialista.nombre;
      filtroEspecialista.appendChild(opcionFiltro);
      const opcionManual = document.createElement('option');
      opcionManual.value = especialista.id_usuario;
      opcionManual.textContent = especialista.nombre;
      especialistaManual.appendChild(opcionManual);
    }
  }

  async function cargarServicios() {
    const datos = await solicitarJson('/api/servicios');
    servicioDatos = datos.servicios;
    serviciosManual.replaceChildren();
    for (const servicio of servicioDatos) {
      const opcion = document.createElement('option');
      opcion.value = servicio.id_servicio;
      opcion.textContent = `${servicio.nombre_servicio} · ${formatoPrecio(servicio.precio)} · ${servicio.duracion_minutos} min`;
      serviciosManual.appendChild(opcion);
    }
  }

  async function cargarHorasDisponibles() {
    horaManual.innerHTML = '<option value="">Cargando horas libres...</option>';
    const ids = Array.from(serviciosManual.selectedOptions).map((opcion) => Number(opcion.value));
    const duracion = ids.reduce((total, id) => {
      const servicio = servicioDatos.find((item) => Number(item.id_servicio) === id);
      return total + (servicio ? Number(servicio.duracion_minutos) : 0);
    }, 0);
    if (!especialistaManual.value || !fechaManual.value || duracion <= 0) {
      horaManual.innerHTML = '<option value="">Selecciona servicios, especialista y fecha</option>';
      return;
    }
    const parametros = new URLSearchParams({
      id_especialista: especialistaManual.value,
      fecha: fechaManual.value,
      duracion: String(duracion),
      modalidad: modalidadManual.value
    });
    try {
      const datos = await solicitarJson(`/api/disponibilidad?${parametros}`);
      horaManual.replaceChildren();
      if (datos.horas_disponibles.length === 0) {
        horaManual.innerHTML = '<option value="">No hay horas disponibles</option>';
        return;
      }
      for (const hora of datos.horas_disponibles) {
        const opcion = document.createElement('option');
        opcion.value = hora;
        opcion.textContent = hora;
        horaManual.appendChild(opcion);
      }
    } catch (error) {
      horaManual.innerHTML = '<option value="">No fue posible cargar las horas</option>';
      mostrarMensaje(error.message, false);
    }
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const cuerpo = {
      nombre: formulario.elements.nombre.value.trim(),
      telefono: formulario.elements.telefono.value.trim(),
      correo: formulario.elements.correo.value.trim(),
      id_servicios: Array.from(serviciosManual.selectedOptions).map((opcion) => Number(opcion.value)),
      id_especialista: Number(especialistaManual.value),
      fecha_cita: fechaManual.value,
      hora_cita: horaManual.value,
      modalidad: modalidadManual.value,
      ciudad: modalidadManual.value === 'domicilio' ? document.getElementById('ciudadManual').value : null,
      direccion_servicio: modalidadManual.value === 'domicilio' ? document.getElementById('direccionManual').value.trim() : null
    };
    try {
      const datos = await solicitarJson('/api/citas/manual', { method: 'POST', body: JSON.stringify(cuerpo) });
      modal.hide();
      mostrarMensaje(datos.mensaje, true);
      await Promise.all([cargarResumen(), cargarAgenda()]);
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  });

  document.getElementById('nuevaCitaManual').addEventListener('click', () => {
    formulario.reset();
    fechaManual.value = hoyLocal(0);
    document.getElementById('domicilioManual').classList.add('d-none');
    cargarHorasDisponibles();
    modal.show();
  });
  modalidadManual.addEventListener('change', () => {
    document.getElementById('domicilioManual').classList.toggle('d-none', modalidadManual.value !== 'domicilio');
    cargarHorasDisponibles();
  });
  serviciosManual.addEventListener('change', cargarHorasDisponibles);
  especialistaManual.addEventListener('change', cargarHorasDisponibles);
  fechaManual.addEventListener('change', cargarHorasDisponibles);
  fechaAgenda.addEventListener('change', () => { modoFiltro = 'dia'; window.inicioSemana = null; window.finSemana = null; cargarAgenda(); });
  filtroEspecialista.addEventListener('change', cargarAgenda);
  filtroEstado.addEventListener('change', cargarAgenda);

  document.getElementById('botonHoy').addEventListener('click', () => {
    modoFiltro = 'dia';
    fechaAgenda.value = hoyLocal(0);
    cargarAgenda();
  });
  document.getElementById('botonManana').addEventListener('click', () => {
    modoFiltro = 'dia';
    fechaAgenda.value = hoyLocal(1);
    cargarAgenda();
  });
  document.getElementById('botonSemana').addEventListener('click', () => {
    const hoy = new Date();
    const dia = hoy.getDay();
    const lunesOffset = dia === 0 ? -6 : 1 - dia;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + lunesOffset);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    const texto = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    modoFiltro = 'desdeHasta';
    window.inicioSemana = texto(lunes);
    window.finSemana = texto(domingo);
    fechaAgenda.value = '';
    cargarAgenda();
  });

  fechaAgenda.value = hoyLocal(0);
  Promise.all([cargarResumen(), cargarEspecialistas(), cargarServicios(), cargarAgenda()]).catch((error) => mostrarMensaje(error.message, false));
}());
