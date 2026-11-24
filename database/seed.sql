USE amys_segura_bella;

-- Categorías del catálogo.
INSERT INTO categoria (nombre_categoria)
SELECT 'manicura' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'manicura');

INSERT INTO categoria (nombre_categoria)
SELECT 'pedicura' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'pedicura');

INSERT INTO categoria (nombre_categoria)
SELECT 'estilismo' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'estilismo');

INSERT INTO categoria (nombre_categoria)
SELECT 'corte' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'corte');

INSERT INTO categoria (nombre_categoria)
SELECT 'colorimetría' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'colorimetría');

INSERT INTO categoria (nombre_categoria)
SELECT 'pestañas' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'pestañas');

INSERT INTO categoria (nombre_categoria)
SELECT 'maquillaje' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre_categoria = 'maquillaje');

-- Servicios de ejemplo con valores expresados en dólares estadounidenses.
INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Manicura clásica', 'Limpieza, limado y esmaltado tradicional.', 12.00, 45, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'manicura'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Manicura clásica');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Manicura semipermanente', 'Preparación de uñas y esmaltado semipermanente.', 22.00, 75, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'manicura'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Manicura semipermanente');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Pedicura spa', 'Cuidado de uñas y tratamiento relajante para los pies.', 25.00, 75, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'pedicura'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Pedicura spa');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Peinado con ondas', 'Peinado con ondas y acabado profesional.', 28.00, 60, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'estilismo'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Peinado con ondas');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Corte de cabello mujer', 'Corte personalizado con lavado y secado básico.', 18.00, 60, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'corte'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Corte de cabello mujer');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Corte de cabello hombre', 'Corte clásico y acabado con máquina o tijera.', 12.00, 40, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'corte'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Corte de cabello hombre');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Tinte de raíz', 'Aplicación de color en crecimiento, sin incluir decoloración.', 45.00, 120, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'colorimetría'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Tinte de raíz');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Balayage', 'Técnica de iluminación personalizada; precio sujeto a evaluación del cabello.', 95.00, 240, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'colorimetría'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Balayage');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Lifting de pestañas', 'Realce de pestañas naturales con tratamiento nutritivo.', 30.00, 75, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'pestañas'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Lifting de pestañas');

INSERT INTO servicio (id_categoria, nombre_servicio, descripcion, precio, duracion_minutos, estado)
SELECT c.id_categoria, 'Maquillaje social', 'Maquillaje para eventos con preparación básica de piel.', 40.00, 90, 'ACTIVO'
FROM categoria c
WHERE c.nombre_categoria = 'maquillaje'
  AND NOT EXISTS (SELECT 1 FROM servicio WHERE nombre_servicio = 'Maquillaje social');
