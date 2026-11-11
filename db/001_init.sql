-- MySQL / MariaDB (Hostinger). Run once with scripts/migrate.mjs. utf8mb4 everywhere.
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  silog_user VARCHAR(100) NOT NULL UNIQUE,   -- identity only: the Silogtran password is verified at login and NEVER stored
  nombre VARCHAR(150) NULL,
  estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_ingreso TIMESTAMP NULL
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS waf_cookies (       -- AWS WAF token reused across serverless invocations
  id TINYINT PRIMARY KEY,
  cookies TEXT NOT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS acta_tipos (        -- fixed values per acta type (names, contract, logo, signature...)
  tipo VARCHAR(10) PRIMARY KEY,
  config LONGTEXT NOT NULL
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS lotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS actas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lote_id INT NOT NULL,
  usuario_id INT NOT NULL,
  remesa VARCHAR(20) NOT NULL,
  consecutivo VARCHAR(50) NOT NULL,
  tipo VARCHAR(10) NULL,
  estado ENUM('PENDIENTE','PROCESANDO','LISTA','REVISAR','APROBADA','ERROR') NOT NULL DEFAULT 'PENDIENTE',
  codigo_error VARCHAR(40) NULL,
  mensaje_error VARCHAR(500) NULL,
  lectura LONGTEXT NULL,        -- JSON of the first reading (as printed)
  alertas LONGTEXT NULL,        -- JSON [{campo, mensaje}]
  datos LONGTEXT NULL,          -- JSON of the editable acta values (what gets printed)
  aprobado_por INT NULL,
  aprobado_en TIMESTAMP NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_remesa_consecutivo (remesa, consecutivo),
  KEY ix_lote (lote_id),
  KEY ix_estado (estado),
  FOREIGN KEY (lote_id) REFERENCES lotes(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) CHARACTER SET utf8mb4;
