(function () {
  const usuario = window.protegerPagina(['administrador', 'recepcionista']);
  if (!usuario) return;

  const token = window.leerToken();
  const mensaje = document.getElementById('mensajeReportes');
  let graficoServicios = null;
  let graficoModalidad = null;

  document.getElementById('nombreUsuarioReportes').textContent = `${usuario.nombre} · ${usuario.rol}`;
  document.getElementById('cerrarSesionReportes').addEventListener('click', window.cerrarSesion);
  if (usuario.rol === 'administrador') {
    document.getElementById('navCatalogo').classList.remove('d-none');
    document.getElementById('navHorarios').classList.remove('d-none');
  }

  function mostrarMensaje(texto, esExito) {
    mensaje.textContent = texto;
    mensaje.classList.toggle('alert-success', esExito);
    mensaje.classList.toggle('alert-danger', !esExito);
    mensaje.classList.remove('d-none');
  }

  async function solicitarJson(url) {
    const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.mensaje || 'No fue posible cargar el reporte.');
    return datos;
  }

  function hoyLocal(sumaDias) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + (sumaDias || 0));
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  }

  function formatoPrecio(precio) {
    return Number(precio).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  async function cargarResumen() {
    const desde = document.getElementById('desdeReporte').value;
    const hasta = document.getElementById('hastaReporte').value;
    try {
      const datos = await solicitarJson(`/api/reportes/resumen?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);
      document.getElementById('citasAtendidas').textContent = datos.citas_atendidas;
      document.getElementById('ingresosEstimados').textContent = formatoPrecio(datos.ingresos_estimados);

      const filas = document.getElementById('filasServiciosReporte');
      filas.replaceChildren();
      if (datos.servicios_mas_solicitados.length === 0) {
        filas.innerHTML = '<tr><td colspan="3" class="text-center text-secondary py-3">No hay servicios completados en este período.</td></tr>';
      } else {
        for (const servicio of datos.servicios_mas_solicitados) {
          const fila = document.createElement('tr');
          for (const texto of [servicio.nombre, String(servicio.cantidad), formatoPrecio(servicio.subtotal)]) {
            const celda = document.createElement('td');
            celda.textContent = texto;
            fila.appendChild(celda);
          }
          filas.appendChild(fila);
        }
      }

      if (graficoServicios) graficoServicios.destroy();
      if (graficoModalidad) graficoModalidad.destroy();
      const nombres = datos.servicios_mas_solicitados.map((item) => item.nombre);
      const cantidades = datos.servicios_mas_solicitados.map((item) => item.cantidad);
      graficoServicios = new Chart(document.getElementById('graficoServicios'), {
        type: 'bar',
        data: { labels: nombres, datasets: [{ label: 'Citas completadas', data: cantidades, backgroundColor: '#c56a86' }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
      graficoModalidad = new Chart(document.getElementById('graficoModalidad'), {
        type: 'doughnut',
        data: {
          labels: ['Estudio', 'Domicilio'],
          datasets: [{ data: [datos.citas_por_modalidad.estudio, datos.citas_por_modalidad.domicilio], backgroundColor: ['#78364f', '#f7e9ed'] }]
        },
        options: { responsive: true }
      });
      mensaje.classList.add('d-none');
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  function etiquetaEstado(estado) {
    const colores = { pendiente: 'text-bg-warning', confirmada: 'text-bg-primary', completada: 'text-bg-success', cancelada: 'text-bg-danger' };
    const etiqueta = document.createElement('span');
    etiqueta.className = `badge ${colores[estado] || 'text-bg-secondary'}`;
    etiqueta.textContent = estado;
    return etiqueta;
  }

  async function cargarDiario() {
    const fecha = document.getElementById('fechaDiario').value;
    try {
      const datos = await solicitarJson(`/api/reportes/diario?fecha=${encodeURIComponent(fecha)}`);
      document.getElementById('diarioPendiente').textContent = datos.total_por_estado.pendiente;
      document.getElementById('diarioConfirmada').textContent = datos.total_por_estado.confirmada;
      document.getElementById('diarioCompletada').textContent = datos.total_por_estado.completada;
      document.getElementById('diarioCancelada').textContent = datos.total_por_estado.cancelada;
      document.getElementById('diarioAtendidas').textContent = datos.citas_atendidas;
      const filas = document.getElementById('filasDiario');
      filas.replaceChildren();
      if (datos.citas.length === 0) {
        filas.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-4">No hay citas para esta fecha.</td></tr>';
      } else {
        for (const cita of datos.citas) {
          const fila = document.createElement('tr');
          const hora = document.createElement('td');
          hora.textContent = String(cita.hora).slice(0, 5);
          const cliente = document.createElement('td');
          cliente.textContent = cita.cliente;
          const servicios = document.createElement('td');
          servicios.textContent = cita.servicio.join(', ');
          const estado = document.createElement('td');
          estado.appendChild(etiquetaEstado(cita.estado));
          fila.append(hora, cliente, servicios, estado);
          filas.appendChild(fila);
        }
      }
      mensaje.classList.add('d-none');
    } catch (error) {
      mostrarMensaje(error.message, false);
    }
  }

  if (usuario.rol === 'administrador') {
    document.getElementById('panelResumen').classList.remove('d-none');
    const desde = document.getElementById('desdeReporte');
    const hasta = document.getElementById('hastaReporte');
    desde.value = hoyLocal(-29);
    hasta.value = hoyLocal(0);
    desde.addEventListener('change', cargarResumen);
    hasta.addEventListener('change', cargarResumen);
    document.getElementById('ultimos7').addEventListener('click', () => { desde.value = hoyLocal(-6); hasta.value = hoyLocal(0); cargarResumen(); });
    document.getElementById('ultimos30').addEventListener('click', () => { desde.value = hoyLocal(-29); hasta.value = hoyLocal(0); cargarResumen(); });
    document.getElementById('esteMes').addEventListener('click', () => {
      const hoy = new Date();
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      desde.value = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`;
      hasta.value = hoyLocal(0);
      cargarResumen();
    });
    cargarResumen();
  } else {
    document.getElementById('panelDiario').classList.remove('d-none');
    const fecha = document.getElementById('fechaDiario');
    fecha.value = hoyLocal(0);
    fecha.addEventListener('change', cargarDiario);
    cargarDiario();
  }
}());
