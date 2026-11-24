(function () {
  const claveToken = 'amys_token';
  const claveUsuario = 'amys_usuario';

  function guardarToken(token) {
    localStorage.setItem(claveToken, token);
  }

  function leerToken() {
    return localStorage.getItem(claveToken);
  }

  function guardarUsuario(usuario) {
    localStorage.setItem(claveUsuario, JSON.stringify(usuario));
  }

  function leerUsuario() {
    try {
      const usuario = localStorage.getItem(claveUsuario);
      return usuario ? JSON.parse(usuario) : null;
    } catch (error) {
      localStorage.removeItem(claveUsuario);
      return null;
    }
  }

  function cerrarSesion() {
    localStorage.removeItem(claveToken);
    localStorage.removeItem(claveUsuario);
    window.location.replace('/login.html');
  }

  function protegerPagina(rolesPermitidos) {
    const token = leerToken();
    const usuario = leerUsuario();

    if (!token || !usuario || typeof usuario.rol !== 'string') {
      cerrarSesion();
      return null;
    }

    if (Array.isArray(rolesPermitidos)
      && rolesPermitidos.length > 0
      && !rolesPermitidos.includes(usuario.rol)) {
      cerrarSesion();
      return null;
    }

    return usuario;
  }

  function mostrarMensaje(elemento, mensaje, esExito) {
    elemento.textContent = mensaje;
    elemento.classList.toggle('alert-success', esExito);
    elemento.classList.toggle('alert-danger', !esExito);
    elemento.classList.remove('d-none');
  }

  async function leerRespuesta(respuesta) {
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(datos.mensaje || 'No fue posible completar la solicitud.');
    }
    return datos;
  }

  function configurarFormularioLogin() {
    const formulario = document.getElementById('formLogin');
    if (!formulario) {
      return;
    }

    const mensaje = document.getElementById('mensajeLogin');
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mensaje.classList.add('d-none');

      try {
        const respuesta = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            correo: formulario.elements.correo.value.trim(),
            contrasenia: formulario.elements.contrasenia.value
          })
        });
        const datos = await leerRespuesta(respuesta);

        if (!datos.token || !datos.usuario) {
          throw new Error('La respuesta del servidor no contiene una sesión válida.');
        }

        guardarToken(datos.token);
        guardarUsuario(datos.usuario);

        const rutasPorRol = {
          cliente: '/servicios.html',
          administrador: '/admin_agenda.html',
          recepcionista: '/admin_agenda.html',
          especialista: '/agenda_especialista.html'
        };
        const ruta = rutasPorRol[datos.usuario.rol];
        if (!ruta) {
          cerrarSesion();
          return;
        }
        window.location.assign(ruta);
      } catch (error) {
        mostrarMensaje(mensaje, error.message || 'No fue posible iniciar sesión.', false);
      }
    });
  }

  function configurarFormularioRegistro() {
    const formulario = document.getElementById('formRegistro');
    if (!formulario) {
      return;
    }

    const mensaje = document.getElementById('mensajeRegistro');
    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      mensaje.classList.add('d-none');

      if (formulario.elements.contrasenia.value !== formulario.elements.confirmarContrasenia.value) {
        mostrarMensaje(mensaje, 'Las contraseñas no coinciden.', false);
        formulario.elements.confirmarContrasenia.focus();
        return;
      }

      try {
        const respuesta = await fetch('/api/auth/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: formulario.elements.nombre.value.trim(),
            correo: formulario.elements.correo.value.trim(),
            telefono: formulario.elements.telefono.value.trim(),
            direccion: formulario.elements.direccion.value.trim(),
            contrasenia: formulario.elements.contrasenia.value
          })
        });
        await leerRespuesta(respuesta);
        mostrarMensaje(mensaje, 'Registro exitoso. Ahora puedes iniciar sesión.', true);
        formulario.reset();
        window.setTimeout(() => {
          window.location.assign('/login.html');
        }, 1200);
      } catch (error) {
        mostrarMensaje(mensaje, error.message || 'No fue posible completar el registro.', false);
      }
    });
  }

  window.guardarToken = guardarToken;
  window.leerToken = leerToken;
  window.guardarUsuario = guardarUsuario;
  window.leerUsuario = leerUsuario;
  window.cerrarSesion = cerrarSesion;
  window.protegerPagina = protegerPagina;

  configurarFormularioLogin();
  configurarFormularioRegistro();
}());
