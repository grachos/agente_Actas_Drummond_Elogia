// Builds the HTML of an "Acta de recibo de servicios" (DLTD variants: CMLTD, CPLTD, EDLTD) and its page header.
// `cfg` = fixed values of the acta type (stored in the DB, never in the repo); `d` = per-acta data (already formatted).
import { MESES } from '../lib/fechas.js';
import { lineasDe } from './datos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const FONT = "Carlito, Calibri, 'Liberation Sans', Arial, sans-serif";

export const HEADER_HEIGHT_MM = 36;

// Used as puppeteer headerTemplate (repeats on every page; page numbers via the pageNumber/totalPages classes).
export function headerTemplate(cfg) {
  return `<div style="width:100%;padding:0 18mm;font-family:${FONT};font-size:9px;box-sizing:border-box">
  <table style="width:100%;border-collapse:collapse;border:1px solid #000;margin-top:8mm">
    <tr>
      <td rowspan="4" style="width:34%;border:1px solid #000;padding:4px;text-align:center"><img src="${cfg.logo}" style="height:15mm"></td>
      <td rowspan="2" style="border:1px solid #000;text-align:center;font-weight:bold;font-size:11px;font-family:Arial,sans-serif">SISTEMA INTEGRADO DE GESTIÓN</td>
      <td style="width:22%;border:1px solid #000;text-align:center;font-family:Arial,sans-serif">${esc(cfg.sigCodigo || 'SIG-1639')}</td>
    </tr>
    <tr><td style="border:1px solid #000;text-align:center;font-family:Arial,sans-serif">Versión 4</td></tr>
    <tr>
      <td rowspan="2" style="border:1px solid #000;text-align:center;font-weight:bold;font-size:11px;font-family:Arial,sans-serif">ACTA DE RECIBO DE SERVICIOS</td>
      <td style="border:1px solid #000;text-align:center;font-family:Arial,sans-serif">${esc(cfg.sigFecha || 'Abril 2017')}</td>
    </tr>
    <tr><td style="border:1px solid #000;text-align:center;font-family:Arial,sans-serif">Página <span class="pageNumber"></span> de <span class="totalPages"></span></td></tr>
  </table></div>`;
}

const row = (k, v, sub = '') =>
  `<tr><td class="k"><b>${k}</b>${sub ? `<br><span class="s">${sub}</span>` : ''}</td><td>${esc(v)}</td></tr>`;

export function actaHtml(cfg, d) {
  const sigla = cfg.empresaSigla;
  const mes = MESES[d.cierre.mes - 1];
  const dei = cfg.variante === 'DEI'; // Drummond Energy Inc. variant (DEIPO): own wording and a 5-signature block
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: ${HEADER_HEIGHT_MM + 6}mm 18mm 14mm 18mm; }
  body { font-family: ${FONT}; font-size: 10.5pt; line-height: 1.25; margin: 0; color: #000; }
  table.f { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.f td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
  table.f td.k { width: 52%; }
  .s { font-size: 9.5pt; }
  table.l { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
  table.l th { background: #808080; color: #fff; border: 1px solid #000; padding: 4px; font-size: 9pt; text-align: center; }
  table.l td { border: 1px solid #000; padding: 6px; text-align: center; font-family: 'Cambria', 'Liberation Serif', serif; font-size: 10pt; }
  table.l td.desc { text-align: left; }
  p { margin: 0 0 7px; text-align: justify; }
  ol { margin: 4px 0 10px 0; padding-left: 28px; text-align: justify; }
  ol li { margin-bottom: 2px; }
  .sig { margin-top: 26px; width: 100%; border-collapse: collapse; }
  .sig td { width: 33%; vertical-align: top; padding-right: 14px; }
  .box { height: 17mm; }
  .line { border-top: 1px solid #000; padding-top: 2px; }
  .firma { height: 15mm; display: block; }
  .ruled { border-bottom: 1px solid #000; height: 17px; }
  .keep { page-break-inside: avoid; }
  </style></head><body>
  <table class="f">
    ${row('FECHA DEL ACTA:', d.fechaActa)}
    ${row('ORDEN DE COMPRA N°:', d.ordenCompleta)}
    ${row('OFERTA MERCANTIL O CONTRATO (Si aplica):', cfg.contrato)}
    ${row('AFE (Si aplica):', cfg.afe)}
  </table>
  <table class="f">
    ${row('CONTRATISTA / PROVEEDOR:', cfg.contratista)}
    ${row('NUMERO DE CONSECUTIVO DEL ACTA', d.consecutivo, '(Numeración interna del Contratista / Proveedor)')}
    <tr><td colspan="2"><b>OBJETO DEL SERVICIO:</b><br><b>${esc(cfg.objetoDeOrden ? d.objeto : cfg.objeto)}</b></td></tr>
  </table>
  <table class="f">
    ${row('SUPERVISOR Y / O SOLICITANTE:', cfg.supervisor)}
    ${row('PLANEADOR:', cfg.planeador)}
    ${row('COMPRADOR:', cfg.comprador)}
  </table>
  <table class="f">
    ${row(`SEDE DE ${sigla} EN LA CUAL SE EJECUTA EL SERVICIO:`, cfg.sede)}
    ${row('FECHA DE INICIO DE LOS SERVICIOS (dd/mm/aaaa):', d.fechaServicio)}
    ${row('FECHA DE TERMINACION DE LOS SERVICIOS (dd/mm/aaaa):', d.fechaServicio)}
  </table>
  <table class="l">
    <colgroup><col style="width:9%"><col style="width:35%"><col style="width:14%"><col style="width:14%"><col style="width:14%"><col style="width:14%"></colgroup>
    <tr><th>Línea de la Orden de Compra</th><th>Descripción</th><th>Cantidad<br>de la Orden de Compra</th><th>Cantidad Facturada<br>de la Orden de Compra</th><th>Valor Unitario<br>de la Orden de Compra</th><th>Valor Total Facturado<br>de la Orden de Compra</th></tr>
    ${lineasDe(d).map((l) => `<tr><td><b>${esc(l.linea)}</b></td><td class="desc">${esc(l.descripcion)}</td><td>${esc(l.cantidadOrden)}</td><td>${esc(l.cantidadFacturada)}</td><td>${esc(l.valorUnitario)}</td><td>${esc(l.valorTotal)}</td></tr>`).join('')}
  </table>
  <p>Se reunieron en las instalaciones de ${esc(cfg.empresaNombre)} (en adelante ${sigla}), la Señora <b>${esc(cfg.repContratista)}</b> en nombre y representación del CONTRATISTA/PROVEEDOR, identificada con cédula de ciudadanía No <b>${esc(cfg.cedulaContratista)}</b> y el Señor <b>${esc(cfg.repDrummond)}</b>, en nombre y representación de ${sigla} con el fin de proceder a la entrega y recibo de las Obras y/o Servicios de la mencionada Orden de Compra y/o Servicios.</p>
  <p>El CONTRATISTA declara lo siguiente:</p>
  <ol>
    <li>Ha pagado oportunamente todos los impuestos nacionales, departamentales y municipales a su cargo relacionados con la ORDEN DE COMPRA.</li>
    <li>Está a paz y salvo con sus empleados por todas sus obligaciones laborales, incluidos salarios, prestaciones, contribuciones por salud, cesantías, pensiones y riesgos laborales, aportes parafiscales y pagos a SENA, ICBF y Caja de Compensación Familiar.</li>
    <li>Se encuentra a paz y salvo con todos sus subcontratistas.</li>
    <li>Todos los compromisos de el CONTRATISTA/PROVEEDOR de mantener indemne a ${sigla}, así como las garantías establecidas a favor de ${sigla} se mantendrán vigentes aún después de la terminación del Contrato por el término establecido en cada caso.</li>
    <li>El CONTRATISTA/PROVEEDOR declara a ${sigla} a paz y salvo y libre de toda posterior reclamación en relación al desarrollo del Servicio solicitado a través de la Orden de Compra arriba relacionada. En consecuencia, el CONTRATISTA/PROVEEDOR, sucesores, socios o causahabientes no podrán iniciar o proseguir acción contra ${sigla} derivado del Servicio prestado a ${sigla} en cumplimiento de tal Orden de Compra.</li>
    <li>Los trabajos / Servicios fueron terminados y son recibidos ${dei ? '' : 'a satisfacción '}mediante esta acta.</li>
  </ol>
  <p style="margin-bottom:0">Comentarios Adicionales:</p><div class="ruled"></div><div class="ruled" style="margin-bottom:10px"></div>
  <p><b>Documentos adjuntos requeridos como parte de las obligaciones del CONTRATISTA/PROVEEDOR:</b><br>
  (ej: mails internos, permisos ambientales, certificaciones laborales, paz y salvos, otros)<br>
  ${esc(d.adjuntos)}</p>
  <p>Con esta acta se deja constancia adicionalmente sobre el cumplimiento por parte del CONTRATISTA/PROVEEDOR y en especial: <b>Es obligación del CONTRATISTA/PROVEEDOR asignado por la presente Orden de Compra, dar cumplimiento a lo establecido en el Manual ${dei ? 'de Contratistas' : 'Integral para Control y Seguimiento de Contratistas'}, sobre los “Requisitos de Gestión Ambiental Y Seguridad Industrial”.</b></p>
  <div class="keep">
  <p style="margin-top:14px">No siendo otro el motivo de la presente acta, se procede a entregar y recibir a satisfacción los trabajos a los <b>${d.cierre.dia} días</b> del mes de <b>${mes}</b> del año <b>${d.cierre.anio}</b>.</p>
  ${dei ? `<table class="sig">
    <tr><td><div class="box">${cfg.firma ? `<img class="firma" src="${cfg.firma}">` : ''}</div><div class="line">(Firma entrega del trabajo)<br><b>CONTRATISTA</b><br>Nombre: <b>${esc(cfg.nombreFirmaContratista)}</b></div></td>
        <td><div class="box"></div><div class="line">(Firma recibo del trabajo)<br><b>DIRECTOR/SUPERINT./SUP. LIDER/COORD.</b><br>Nombre: <b>${esc(cfg.firmaDirector)}</b></div></td>
        <td><div class="box"></div><div class="line">(Firma y Sello de Bodega)</div></td></tr>
    <tr><td><div class="box"></div><div class="line">(Firma recibo del trabajo)<br><b>GERENTE DE ÁREA</b><br>Nombre: <b>${esc(cfg.firmaGerente)}</b></div></td>
        <td><div class="box"></div><div class="line">(Firma aprobación servicio)<br><b>COUNTRY MANAGER</b><br>Nombre: <b>${esc(cfg.firmaCountry)}</b></div></td><td></td></tr>
  </table></div>` : `<table class="sig">
    <tr><td><div class="box">${cfg.firma ? `<img class="firma" src="${cfg.firma}">` : ''}</div><div class="line">(Firma entrega del trabajo)<br><b>CONTRATISTA</b><br>NOMBRE: <b>${esc(cfg.nombreFirmaContratista)}</b></div></td>
        <td><div class="box"></div><div class="line">(Firma recibo del trabajo)<br><b>SUPERVISOR Y/O SOLICITANTE ${sigla}.</b><br>NOMBRE:</div></td><td></td></tr>
    <tr><td><div class="box"></div><div class="line">(Firma recibo del trabajo)<br><b>SUPERVISOR LIDER DRUMMOND LTD.</b></div></td>
        <td><div class="box"></div><div class="line">(Firma aprobación servicio – si aplica)<br><b>SUPERINTENDENTE / GERENTE AREA ${sigla}.</b></div></td>
        <td><div class="box"></div><div class="line">(Firma y Sello de Bodega)</div></td></tr>
  </table></div>`}
  </body></html>`;
}
