// Excel report of the approved (registered) actas: remesa, total of the acta (sum of its lines) and the acta number.
import { totalActa } from './actas/datos.js';

export async function reporteExcel(filas) {
  const { default: ExcelJS } = await import('exceljs'); // loaded only when a report is requested (keeps the other endpoints light)
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Actas de entrega';
  const ws = wb.addWorksheet('Actas', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Número de remesa', key: 'remesa', width: 22 },
    { header: 'Total acta', key: 'total', width: 20, style: { numFmt: '"$" #,##0' } },
    { header: 'Número de consecutivo del acta', key: 'consecutivo', width: 34 },
  ];
  for (const f of filas) ws.addRow({ remesa: String(f.remesa), total: totalActa(f.datos), consecutivo: f.consecutivo }); // remesa as text keeps leading zeros
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D6F42' } };
  head.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.autoFilter = { from: 'A1', to: 'C1' };
  ws.getColumn('remesa').numFmt = '@';
  return Buffer.from(await wb.xlsx.writeBuffer());
}
