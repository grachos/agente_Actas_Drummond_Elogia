// Money/quantity helpers. Amounts are handled as integer cents (BigInt-free: pesos fit in Number) — never floats.

// "4,536,000.00" | "4,536,000" | "3.00EA" -> integer cents (453600000). Returns null if not a clean US-format number.
export function parseUS(text) {
  const t = String(text ?? '').trim().replace(/[A-Za-z\s$]/g, '');
  if (!/^\d{1,3}(,\d{3})*(\.\d{1,4})?$|^\d+(\.\d{1,4})?$/.test(t)) return null;
  const [int, dec = ''] = t.replace(/,/g, '').split('.');
  return Number(int) * 100 + Number((dec + '00').slice(0, 2));
}

// cents -> "4.536.000" (Colombian thousands, no decimals when exact pesos).
export function formatCOP(cents) {
  const pesos = Math.trunc(cents / 100);
  const frac = cents % 100;
  const s = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${s},${String(frac).padStart(2, '0')}` : s;
}

// quantity in hundredths (cents-like) -> "3,00"
export const formatQty = (hundredths) => `${Math.trunc(hundredths / 100)},${String(hundredths % 100).padStart(2, '0')}`;
