(function () {
  const usuario = window.protegerPagina(['administrador']);
  if (!usuario) {
    return;
  }

  const token = window.leerToken();
  const formulario = document.getElementById('formServicio');
  const filasServicios = document.getElementById('filasServicios');
  const categoriaServicio = document.getElementById('categoriaServicio');
  const modalElemento = document.getElementById('modalServicio');
  const modal = new bootstrap.Modal(modalElemento);
  const mensaje = document.getElementById('mensajeAdminCatalogo');
  const botonNuevo = document.getElementById('nuevoServicio');
  let idServicioEnEdicion = null;

  document.getElementById('cerrarSesionCatalogo').addEventListener('click', window.cerrarSesion);

  function mostrarMensaje(texto, esExito) {
    mensaje.textContent = texto;
    mensaje.classList.toggle('alert-success', esExito);
    mensaje.classList.toggle('alert-danger', !esExito);
    mensaje.classList.remove('d-none');
  }

  async function solicitarJson(url, opciones) {
    const config = opciones || {};
    config.headers = {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`
    };
    if (config.body) {
      config.headers['Content-Type'] = 'application/json';
    }

    const respuesta = await fetch(url, config);
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(datos.mensaje || 'No fue posible completar la solicitud.');
    }
    return datos;
  }

  function formatoPrecio(precio) {
    return Number(precio).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });
  }

  function crearFila(servicio) {
    const fila = document.createElement('tr');
    const valores = [
      servicio.nombre_servicio,
      servicio.nombre_categoria,
      formatoPrecio(servicio.precio),
      `${servicio.duracion_minutos} min`
    ];

    for (const valor of valores) {
      const celda = document.createElement('td');
      celda.textContent = valor;
      fila.appendChild(celda);
    }

    const celdaEstado = document.createElement('td');
    const etiquetaEstado = document.createElement('span');
    etiquetaEstado.className = servicio.estado === 'ACTIVO'
      ? 'badge text-bg-success'
      : 'badge text-bg-secondary';
    etiquetaEstado.textContent = servicio.estado;
    celdaEstado.appendChild(etiquetaEstado);
    fila.appendChild(celdaEstado);

    const celdaAcciones = document.createElement('td');
    celdaAcciones.className = 'text-nowrap';

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'btn btn-sm btn-outline-primary me-2';
    botonEditar.textContent = 'Editar';
    botonEditar.addEventListener('click', () => abrirEdicion(servicio));
    celdaAcciones.appendChild(botonEditar);

    const botonEstado = document.createElement('button');
    botonEstado.type = 'button';
    botonEstado.className = servicio.estado === 'ACTIVO'
      ? 'btn btn-sm btn-outline-danger'
      : 'btn btn-sm btn-outline-success';
    botonEstado.textContent = servicio.estado === 'ACTIVO' ? 'Inactivar' : 'Activar';
    botonEstado.addEventListener('click', () => cambiarEstado(servicio));
    celdaAcciones.appendChild(botonEstado);

    fila.appendChild(celdaAcciones);
    return fila;
  }

  async function cargarServicios() {
    const datos = await solicitarJson('/api/servicios/admin/todos');
    filasServicios.replaceChildren();

    if (datos.servicios.length === 0) {
      const fila = document.createElement('tr');
      const celda = document.createElement('td');
      celda.colSpan = 6;
      celda.className = 'text-center text-secondary py-4';
      celda.textContent = 'Todavía no hay servicios en el catálogo.';
      fila.appendChild(celda);
      filasServicios.appendChild(fila);
      return;
    }

    for (const servicio of datos.servicios) {
      filasServicios.appendChild(crearFila(servicio));
    }
  }

  async function cargarCategorias() {
    const datos = await solicitarJson('/api/categorias');
    for (const categoria of datos.categorias) {
      const opcion = document.createElement('option');
      opcion.value = categoria.id_categoria;
      opcion.textContent = categoria.nombre_categoria;
      categoriaServicio.appendChild(opcion);
    }
    botonNuevo.disabled = false;
  }

  function abrirCreacion() {
    idServicioEnEdicion = null;
    formulario.reset();
    document.getElementById('tituloModalServicio').textContent = 'Nuevo servicio';
    modal.show();
  }

  function abrirEdicion(servicio) {
    idServicioEnEdicion = servicio.id_servicio;
    formulario.elements.nombre_servicio.value = servicio.nombre_servicio;
    formulario.elements.id_categoria.value = servicio.id_categoria;
    formulario.elements.descripcion.value = servicio.descripcion || '';
    formulario.elements.precio.value = Number(servicio.precio).toFixed(2);
    formulario.elements.duracion_minutos.value = servicio.duracion_minutos;
    formulario.elements.imagen_url.value = servicio.imagen_url || '';
    document.getElementById('tituloModalServicio').textContent = 'Editar servicio';
    modal.show();
  }

  async function cambiarEstado(servicio) {
    const nuevoEstado = servicio.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    const accion = nuevoEstado === 'ACTIVO' ? 'activar' : 'inactivar';
    if (!window.confirm(`¿Deseas ${accion} el servicio "${servicio.nombre_servicio}"?`)) {
      return;
    }

    try {
      const datos = await solicitarJson(`/api/servicios/${encodeURIComponent(servicio.id_servicio)}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado })
      });
      mostrarMensaje(datos.mensaje, true);
      await cargarServicios();
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) {
      return;
    }

    const cuerpo = {
      nombre_servicio: formulario.elements.nombre_servicio.value.trim(),
      id_categoria: Number(formulario.elements.id_categoria.value),
      descripcion: formulario.elements.descripcion.value.trim(),
      precio: Number(formulario.elements.precio.value),
      duracion_minutos: Number(formulario.elements.duracion_minutos.value),
      imagen_url: formulario.elements.imagen_url.value.trim()
    };
    const editando = idServicioEnEdicion !== null;
    const url = editando
      ? `/api/servicios/${encodeURIComponent(idServicioEnEdicion)}`
      : '/api/servicios';

    try {
      const datos = await solicitarJson(url, {
        method: editando ? 'PUT' : 'POST',
        body: JSON.stringify(cuerpo)
      });
      modal.hide();
      mostrarMensaje(datos.mensaje, true);
      await cargarServicios();
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  });

  botonNuevo.addEventListener('click', abrirCreacion);

  Promise.all([cargarCategorias(), cargarServicios()]).catch((error) => {
    mostrarMensaje(error.message, false);
  });
}());
