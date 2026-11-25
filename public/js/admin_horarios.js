(function () {
  const usuario = window.protegerPagina(['administrador']);
  if (!usuario) return;

  const token = window.leerToken();
  const filas = document.getElementById('filasHorarios');
  const filtro = document.getElementById('especialistaHorario');
  const selectorModal = document.getElementById('especialistaHorarioModal');
  const formulario = document.getElementById('formHorario');
  const mensaje = document.getElementById('mensajeHorarios');
  const modal = new bootstrap.Modal(document.getElementById('modalHorario'));
  const nombresDias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  let idHorarioEdicion = null;

  document.getElementById('nombreUsuarioHorarios').textContent = `Hola, ${usuario.nombre}`;
  document.getElementById('cerrarSesionHorarios').addEventListener('click', window.cerrarSesion);

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

  function horaCorta(hora) {
    return String(hora).slice(0, 5);
  }

  async function cargarEspecialistas() {
    const datos = await solicitarJson('/api/horarios');
    for (const especialista of datos.especialistas) {
      const opcionFiltro = document.createElement('option');
      opcionFiltro.value = especialista.id_usuario;
      opcionFiltro.textContent = especialista.nombre;
      filtro.appendChild(opcionFiltro);
      const opcionModal = document.createElement('option');
      opcionModal.value = especialista.id_usuario;
      opcionModal.textContent = especialista.nombre;
      selectorModal.appendChild(opcionModal);
    }
  }

  async function cargarHorarios() {
    const parametro = filtro.value ? `?id_especialista=${encodeURIComponent(filtro.value)}` : '';
    filas.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-4">Cargando horarios...</td></tr>';
    try {
      const datos = await solicitarJson(`/api/horarios${parametro}`);
      filas.replaceChildren();
      if (datos.horarios.length === 0) {
        filas.innerHTML = '<tr><td colspan="5" class="text-center text-secondary py-4">No hay bloques horarios registrados.</td></tr>';
        return;
      }
      for (const bloque of datos.horarios) {
        const fila = document.createElement('tr');
        for (const texto of [
          bloque.nombre_especialista,
          nombresDias[Number(bloque.dia_semana)],
          horaCorta(bloque.hora_inicio),
          horaCorta(bloque.hora_fin)
        ]) {
          const celda = document.createElement('td');
          celda.textContent = texto;
          fila.appendChild(celda);
        }
        const acciones = document.createElement('td');
        acciones.className = 'd-flex gap-2';
        const editar = document.createElement('button');
        editar.type = 'button';
        editar.className = 'btn btn-sm btn-outline-primary';
        editar.textContent = 'Editar';
        editar.addEventListener('click', () => abrirEdicion(bloque));
        const eliminar = document.createElement('button');
        eliminar.type = 'button';
        eliminar.className = 'btn btn-sm btn-outline-danger';
        eliminar.textContent = 'Eliminar';
        eliminar.addEventListener('click', () => eliminarHorario(bloque));
        acciones.append(editar, eliminar);
        fila.appendChild(acciones);
        filas.appendChild(fila);
      }
      mensaje.classList.add('d-none');
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  function abrirCreacion() {
    idHorarioEdicion = null;
    formulario.reset();
    document.getElementById('tituloHorario').textContent = 'Agregar bloque';
    if (filtro.value) selectorModal.value = filtro.value;
    modal.show();
  }

  function abrirEdicion(bloque) {
    idHorarioEdicion = bloque.id_horario;
    selectorModal.value = bloque.id_especialista;
    document.getElementById('diaHorario').value = bloque.dia_semana;
    document.getElementById('horaInicioHorario').value = horaCorta(bloque.hora_inicio);
    document.getElementById('horaFinHorario').value = horaCorta(bloque.hora_fin);
    document.getElementById('tituloHorario').textContent = 'Editar bloque';
    modal.show();
  }

  async function eliminarHorario(bloque) {
    if (!window.confirm(`¿Deseas eliminar el bloque de ${nombresDias[Number(bloque.dia_semana)]} de ${horaCorta(bloque.hora_inicio)} a ${horaCorta(bloque.hora_fin)}?`)) return;
    try {
      const datos = await solicitarJson(`/api/horarios/${encodeURIComponent(bloque.id_horario)}`, { method: 'DELETE' });
      mostrarMensaje(datos.mensaje, true);
      await cargarHorarios();
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const cuerpo = {
      id_especialista: Number(selectorModal.value),
      dia_semana: Number(document.getElementById('diaHorario').value),
      hora_inicio: document.getElementById('horaInicioHorario').value,
      hora_fin: document.getElementById('horaFinHorario').value
    };
    try {
      const datos = await solicitarJson(
        idHorarioEdicion ? `/api/horarios/${encodeURIComponent(idHorarioEdicion)}` : '/api/horarios',
        { method: idHorarioEdicion ? 'PUT' : 'POST', body: JSON.stringify(cuerpo) }
      );
      modal.hide();
      mostrarMensaje(datos.mensaje, true);
      await cargarHorarios();
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  });

  document.getElementById('agregarHorario').addEventListener('click', abrirCreacion);
  filtro.addEventListener('change', cargarHorarios);
  Promise.all([cargarEspecialistas(), cargarHorarios()]);
}());
