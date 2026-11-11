-- Applied once (tracked in schema_migrations). IGNORADA = the Bill of Inland does not say «SEGÚN TRF» (no acta is made).
ALTER TABLE actas MODIFY estado ENUM('PENDIENTE','PROCESANDO','LISTA','REVISAR','APROBADA','ERROR','IGNORADA') NOT NULL DEFAULT 'PENDIENTE';

-- Next acta number per type; assigned when an acta is approved. Starting values given by the owner on 2026-11-11 (others are set in the config screen).
CREATE TABLE IF NOT EXISTS consecutivos (
  tipo VARCHAR(10) PRIMARY KEY,
  siguiente INT NOT NULL
) CHARACTER SET utf8mb4;
INSERT IGNORE INTO consecutivos (tipo, siguiente) VALUES ('CPLTD', 68), ('CMLTD', 75);
