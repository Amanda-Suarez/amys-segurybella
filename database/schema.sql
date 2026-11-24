CREATE DATABASE IF NOT EXISTS amys_segura_bella CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE amys_segura_bella;

-- Datos de acceso y perfil de los usuarios del sistema.
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    contrasenia VARCHAR(255) NOT NULL,
    telefono VARCHAR(20) NULL,
    direccion VARCHAR(255) NULL,
    rol ENUM('cliente', 'administrador', 'especialista', 'recepcionista') NOT NULL,
    estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_usuario),
    UNIQUE KEY uq_usuario_correo (correo),
    KEY idx_usuario_rol_estado (rol, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clasificación de los servicios ofrecidos.
CREATE TABLE IF NOT EXISTS categoria (
    id_categoria INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre_categoria VARCHAR(100) NOT NULL,
    PRIMARY KEY (id_categoria),
    UNIQUE KEY uq_categoria_nombre (nombre_categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo de servicios con su precio y duración.
CREATE TABLE IF NOT EXISTS servicio (
    id_servicio INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_categoria INT UNSIGNED NOT NULL,
    nombre_servicio VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    precio DECIMAL(8,2) NOT NULL,
    duracion_minutos SMALLINT UNSIGNED NOT NULL,
    imagen_url VARCHAR(500) NULL,
    estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    PRIMARY KEY (id_servicio),
    KEY idx_servicio_categoria (id_categoria),
    KEY idx_servicio_estado (estado),
    CONSTRAINT fk_servicio_categoria
        FOREIGN KEY (id_categoria) REFERENCES categoria (id_categoria)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Disponibilidad semanal de cada especialista; dia_semana usa 1=lunes y 7=domingo.
CREATE TABLE IF NOT EXISTS horario_especialista (
    id_horario INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_especialista INT UNSIGNED NOT NULL,
    dia_semana TINYINT UNSIGNED NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    PRIMARY KEY (id_horario),
    UNIQUE KEY uq_horario_especialista_dia_inicio (id_especialista, dia_semana, hora_inicio),
    KEY idx_horario_dia (dia_semana),
    CONSTRAINT fk_horario_especialista_usuario
        FOREIGN KEY (id_especialista) REFERENCES usuario (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Citas reservadas para atención en estudio o a domicilio.
CREATE TABLE IF NOT EXISTS cita (
    id_cita INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_cliente INT UNSIGNED NOT NULL,
    id_especialista INT UNSIGNED NOT NULL,
    fecha_cita DATE NOT NULL,
    hora_cita TIME NOT NULL,
    hora_fin TIME NOT NULL,
    modalidad ENUM('estudio', 'domicilio') NOT NULL,
    ciudad ENUM('Otavalo', 'Ibarra') NULL,
    direccion_servicio VARCHAR(255) NULL,
    estado_cita ENUM('pendiente', 'confirmada', 'completada', 'cancelada') NOT NULL DEFAULT 'pendiente',
    codigo_comprobante VARCHAR(100) NOT NULL,
    total DECIMAL(8,2) NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_cita),
    UNIQUE KEY uq_cita_codigo_comprobante (codigo_comprobante),
    KEY idx_cita_cliente_fecha (id_cliente, fecha_cita),
    KEY idx_cita_especialista_fecha_hora (id_especialista, fecha_cita, hora_cita),
    KEY idx_cita_estado_fecha (estado_cita, fecha_cita),
    CONSTRAINT fk_cita_cliente
        FOREIGN KEY (id_cliente) REFERENCES usuario (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_cita_especialista
        FOREIGN KEY (id_especialista) REFERENCES usuario (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Servicios incluidos en cada cita.
CREATE TABLE IF NOT EXISTS detalle_cita (
    id_detalle INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_cita INT UNSIGNED NOT NULL,
    id_servicio INT UNSIGNED NOT NULL,
    subtotal DECIMAL(8,2) NOT NULL,
    PRIMARY KEY (id_detalle),
    KEY idx_detalle_cita (id_cita),
    KEY idx_detalle_servicio (id_servicio),
    CONSTRAINT fk_detalle_cita
        FOREIGN KEY (id_cita) REFERENCES cita (id_cita)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_detalle_servicio
        FOREIGN KEY (id_servicio) REFERENCES servicio (id_servicio)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
