// Renders the acta HTML to a Letter PDF with headless Chromium (same browser as the WAF solver).
import { launchBrowser } from '../silogtran/browser.js';
import { actaHtml, headerTemplate, HEADER_HEIGHT_MM } from './html.js';

export async function renderActaPdf(cfg, datos) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(actaHtml(cfg, datos), { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(cfg),
      footerTemplate: '<span></span>',
      margin: { top: `${HEADER_HEIGHT_MM + 6}mm`, bottom: '14mm', left: '18mm', right: '18mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
