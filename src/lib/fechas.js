// Date helpers (America/Bogota). Pure functions except `hoyBogota`.
export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const ABREV = { ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12 };

export function hoyBogota(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { dia: Number(p.day), mes: Number(p.month), anio: Number(p.year) };
}

const pad = (n) => String(n).padStart(2, '0');
export const dmy = ({ dia, mes, anio }) => `${pad(dia)}/${pad(mes)}/${anio}`;

export function esFechaValida({ dia, mes, anio }) {
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// "2026-09-02" -> { dia: 2, mes: 9, anio: 2026 } (null if malformed or impossible)
export function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return null;
  const f = { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
  return esFechaValida(f) ? f : null;
}

// Bill of Inland date boxes: day "2", month "SEP", year "26" -> { dia: 2, mes: 9, anio: 2026 }
export function parseBillDate(dia, mes, anio2) {
  const mm = ABREV[String(mes ?? '').trim().toUpperCase()];
  const yy = Number(anio2);
  if (!mm || !Number.isInteger(yy)) return null;
  const f = { dia: Number(dia), mes: mm, anio: yy < 100 ? 2000 + yy : yy };
  return esFechaValida(f) ? f : null;
}
