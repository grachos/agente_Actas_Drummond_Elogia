-- One-time cleanup requested by the owner (2026-11-11): a test acta (remesa 0101219749, numbered by hand as GGOMEZ19).
-- Exact match on both columns, so no other acta can be touched. Applied once (tracked in schema_migrations).
DELETE FROM actas WHERE remesa = '0101219749' AND consecutivo = 'GGOMEZ19';
