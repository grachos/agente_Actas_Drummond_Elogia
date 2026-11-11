// Reads the scanned support PDF with Claude (vision, PDF sent directly). Output = strings exactly as printed; code parses/validates.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { ApiError } from '../http/errors.js';

const str = (d) => ({ type: ['string', 'null'], description: d });
const TOOL = {
  name: 'registrar_lectura',
  description: 'Registra los datos leídos del PDF de soporte de una remesa.',
  input_schema: {
    type: 'object',
    properties: {
      remesa_numero: str('Número impreso en «REMESA TERRESTRE DE CARGA» (campo No.), solo dígitos'),
      remesa_fecha: str('Fecha de la remesa AAAA-MM-DD (campos AÑO / MES / DÍA)'),
      remesa_placa: str('Placa del vehículo en la remesa, 3 letras + 3 dígitos, sin espacios'),
      bill_codigo: str('Valor de «# BILL OF INLAND», ej. SMR025SEP26'),
      bill_cargo_consignment: str('Valor de «CARGO CONSIGNMENT» del Bill of Inland, solo dígitos'),
      bill_fecha_despacho: str('«DATE OF DISPATCH» del Bill of Inland como AAAA-MM-DD (día / mes abreviado / año de 2 dígitos)'),
      bill_placa: str('Placa del cuadro de letras del Bill of Inland, sin espacios'),
      bill_po_transport: str('Valor de «PO. TRANSPORT» del Bill of Inland tal cual, ej. «500284486A L12»'),
      orden_numero: str('Número de la orden de compra con prefijo, ej. CPLTD-500284486A (página «Purchase Order» u «Orden de Compra»)'),
      lineas_orden: {
        type: 'array',
        description: 'TODAS las líneas de la orden de compra visibles en esa página',
        items: {
          type: 'object',
          properties: {
            linea: { type: 'integer', description: 'Número de línea (el número antes del guion en «Lín-Env», ej. «12- 1» → 12)' },
            descripcion: { type: 'string', description: 'Descripción tal cual en una sola línea, SIN la parte «JURISDICCIÓN: …»' },
            cantidad: { type: 'string', description: 'Cantidad impresa, ej. «3.00EA»' },
            precio: { type: 'string', description: 'Precio unitario (PO Price) impreso, ej. «1,296,000.00»' },
            total: { type: 'string', description: 'Monto (Extended Amt / Valor Total) impreso, ej. «3,888,000.00»' },
          },
          required: ['linea', 'descripcion', 'cantidad', 'precio', 'total'],
        },
      },
      orden_salida_placa: str('Placa en la «ORDEN DE SALIDA» de Drummond; null si no hay esa página'),
      trf_numeros: { type: 'array', items: { type: 'string' }, description: 'Números «TRF NUMBER» legibles de los Transport Request Form (puede haber varios; omite los ilegibles)' },
      paginas: {
        type: 'object',
        description: 'Número de página del PDF (1 = primera) donde está cada documento; null si no existe',
        properties: { remesa: { type: ['integer', 'null'] }, bill: { type: ['integer', 'null'] }, orden: { type: ['integer', 'null'] }, orden_salida: { type: ['integer', 'null'] } },
      },
      campos_dudosos: { type: 'array', items: { type: 'string' }, description: 'Nombres de campos que no se leen con certeza total' },
    },
    required: ['remesa_numero', 'bill_codigo', 'bill_cargo_consignment', 'bill_fecha_despacho', 'bill_placa', 'bill_po_transport', 'orden_numero', 'lineas_orden'],
  },
};

const PROMPT = `Este PDF es un paquete ESCANEADO de soporte de una remesa de transporte (Elogia / Drummond). Puede traer: Remesa terrestre de carga (3 copias en una hoja), Bill of Inland, Orden de salida, uno o varios Transport Request Form y la orden de compra («Purchase Order» u «Orden de Compra»). El orden de páginas varía.
Lee los datos y llama OBLIGATORIAMENTE a la herramienta registrar_lectura (es la única forma de responder; no escribas texto).
Reglas estrictas: son datos sensibles y deben ser exactos. Copia cada valor TAL CUAL está impreso (no corrijas, no calcules, no completes). Si un dato no es legible con certeza, devuelve null y agrégalo a campos_dudosos; NUNCA adivines. Ignora vistos (✓), rayas y escritos a mano que no sean el dato. Los cuadros de letras de la placa se leen juntos (S P X 7 3 6 → SPX736). Para la orden de compra incluye todas las líneas visibles con sus números exactos.`;

export async function leerSoporte(pdf, { modelo = process.env.IA_MODELO || 'claude-sonnet-5-5', cliente, remesa } = {}) {
  if (process.env.ACTAS_MOCK === '1' && !process.env.VERCEL) return JSON.parse(readFileSync(new URL(`../../fixtures/lecturas/${remesa}.json`, import.meta.url), 'utf8')); // local development only
  if (!cliente && !process.env.ANTHROPIC_API_KEY) throw new ApiError('CONFIG_MISSING', 'Falta configurar ANTHROPIC_API_KEY en el servidor.', { status: 500 });
  const ai = cliente ?? new Anthropic({ timeout: 35000, maxRetries: 0 });
  let msg;
  try {
    msg = await ai.messages.create({
      model: modelo,
      max_tokens: 4000,
      tools: [TOOL],
      messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(pdf).toString('base64') } }, { type: 'text', text: PROMPT }] }],
    });
  } catch (e) {
    throw new ApiError('IA_ERROR', 'No se pudo leer el PDF con la IA.', { status: 502, detail: e?.message || String(e) });
  }
  const block = msg.content.find((b) => b.type === 'tool_use');
  if (!block?.input) throw new ApiError('IA_ERROR', 'La IA no devolvió datos.', { status: 502, detail: `stop_reason=${msg.stop_reason}` });
  return block.input;
}
