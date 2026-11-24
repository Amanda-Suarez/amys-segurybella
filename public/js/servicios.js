(function () {
  const usuario = window.protegerPagina(['cliente', 'recepcionista', 'administrador']);
  if (!usuario) {
    return;
  }

  const filtroCategoria = document.getElementById('filtroCategoria');
  const buscarServicio = document.getElementById('buscarServicio');
  const listaServicios = document.getElementById('listaServicios');
  const estadoCarga = document.getElementById('estadoCarga');
  const sinResultados = document.getElementById('sinResultados');
  const mensajeCatalogo = document.getElementById('mensajeCatalogo');
  let temporizadorBusqueda;
  let solicitudActual = 0;

  document.getElementById('saludoUsuario').textContent = `Hola, ${usuario.nombre}`;
  document.getElementById('cerrarSesionNav').addEventListener('click', window.cerrarSesion);

  function mostrarError(mensaje) {
    mensajeCatalogo.textContent = mensaje;
    mensajeCatalogo.classList.remove('d-none', 'alert-success');
    mensajeCatalogo.classList.add('alert-danger');
  }

  async function solicitarJson(url) {
    const respuesta = await fetch(url);
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(datos.mensaje || 'No fue posible cargar el catálogo.');
    }
    return datos;
  }

  async function cargarCategorias() {
    const datos = await solicitarJson('/api/categorias');
    for (const categoria of datos.categorias) {
      const opcion = document.createElement('option');
      opcion.value = categoria.id_categoria;
      opcion.textContent = categoria.nombre_categoria;
      filtroCategoria.appendChild(opcion);
    }
  }

  function crearMarcador(nombre) {
    const marcador = document.createElement('div');
    marcador.className = 'servicio-imagen__respaldo';
    marcador.textContent = nombre.trim().charAt(0).toLocaleUpperCase('es') || 'A';
    return marcador;
  }

  function agregarImagen(contenedor, servicio) {
    const respaldo = crearMarcador(servicio.nombre_servicio);
    contenedor.appendChild(respaldo);
    if (!servicio.imagen_url) {
      return;
    }

    let urlImagen;
    try {
      urlImagen = new URL(servicio.imagen_url, window.location.origin);
    } catch (error) {
      return;
    }
    if (urlImagen.protocol !== 'http:' && urlImagen.protocol !== 'https:') {
      return;
    }

    const imagen = document.createElement('img');
    imagen.src = urlImagen.href;
    imagen.alt = servicio.nombre_servicio;
    imagen.loading = 'lazy';
    imagen.addEventListener('load', () => respaldo.remove(), { once: true });
    imagen.addEventListener('error', () => imagen.remove(), { once: true });
    contenedor.appendChild(imagen);
  }

  function crearTarjeta(servicio) {
    const columna = document.createElement('div');
    columna.className = 'col-12 col-md-6 col-xl-4';

    const tarjeta = document.createElement('article');
    tarjeta.className = 'card servicio-card h-100';

    const imagen = document.createElement('div');
    imagen.className = 'servicio-imagen';
    agregarImagen(imagen, servicio);

    const contenido = document.createElement('div');
    contenido.className = 'card-body d-flex flex-column';

    const categoria = document.createElement('span');
    categoria.className = 'badge rounded-pill align-self-start mb-2';
    categoria.textContent = servicio.nombre_categoria;

    const nombre = document.createElement('h2');
    nombre.className = 'h5 card-title';
    nombre.textContent = servicio.nombre_servicio;

    const descripcion = document.createElement('p');
    descripcion.className = 'card-text text-secondary servicio-descripcion';
    descripcion.textContent = servicio.descripcion || 'Un servicio pensado para que disfrutes un momento especial.';

    const detalles = document.createElement('div');
    detalles.className = 'd-flex justify-content-between align-items-center gap-2 mt-auto pt-3';

    const precio = document.createElement('strong');
    precio.className = 'servicio-precio';
    precio.textContent = Number(servicio.precio).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });

    const duracion = document.createElement('span');
    duracion.className = 'small text-secondary text-end';
    duracion.textContent = `${servicio.duracion_minutos} minutos`;

    const reservar = document.createElement('a');
    reservar.className = 'btn btn-primary w-100 mt-3';
    reservar.href = `/reservar.html?servicio=${encodeURIComponent(servicio.id_servicio)}`;
    reservar.textContent = 'Reservar turno';

    detalles.append(precio, duracion);
    contenido.append(categoria, nombre, descripcion, detalles, reservar);
    tarjeta.append(imagen, contenido);
    columna.appendChild(tarjeta);
    return columna;
  }

  async function cargarServicios() {
    const numeroSolicitud = ++solicitudActual;
    const parametros = new URLSearchParams();
    if (filtroCategoria.value) {
      parametros.set('categoria', filtroCategoria.value);
    }
    if (buscarServicio.value.trim()) {
      parametros.set('buscar', buscarServicio.value.trim());
    }
    const sufijo = parametros.toString() ? `?${parametros.toString()}` : '';

    estadoCarga.classList.remove('d-none');
    estadoCarga.textContent = 'Cargando servicios...';
    sinResultados.classList.add('d-none');
    listaServicios.replaceChildren();
    mensajeCatalogo.classList.add('d-none');

    try {
      const datos = await solicitarJson(`/api/servicios${sufijo}`);
      if (numeroSolicitud !== solicitudActual) {
        return;
      }

      estadoCarga.classList.add('d-none');
      if (datos.servicios.length === 0) {
        sinResultados.classList.remove('d-none');
        return;
      }
      for (const servicio of datos.servicios) {
        listaServicios.appendChild(crearTarjeta(servicio));
      }
    } catch (error) {
      if (numeroSolicitud !== solicitudActual) {
        return;
      }
      estadoCarga.classList.add('d-none');
      mostrarError(error.message);
    }
  }

  filtroCategoria.addEventListener('change', cargarServicios);
  buscarServicio.addEventListener('input', () => {
    window.clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = window.setTimeout(cargarServicios, 250);
  });

  cargarCategorias()
    .then(cargarServicios)
    .catch((error) => {
      estadoCarga.classList.add('d-none');
      mostrarError(error.message);
    });
}());
