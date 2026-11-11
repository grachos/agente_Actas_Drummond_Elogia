-- Failed Silogtran logins through this app (protects people's Silogtran accounts from lockout by repeated attempts).
CREATE TABLE IF NOT EXISTS login_intentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  silog_user VARCHAR(100) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_user_fecha (silog_user, creado_en)
) CHARACTER SET utf8mb4;
