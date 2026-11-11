# Actas de entrega · Drummond / Elogia

Aplicación web que genera las **actas de entrega** (DEIPO, CMLTD, CPLTD, EDLTD) a partir de remesas de Silogtran:

1. Cargas remesas (Excel o a mano); el consecutivo de cada acta se asigna solo al aprobar, desde un contador por tipo en Configuración.
2. El sistema baja el PDF de soporte de cada remesa desde Silogtran y lo **lee con IA** (Anthropic).
3. Una persona **revisa** los datos junto al soporte, en una sola pantalla, y aprueba.
4. Se genera **un solo PDF por remesa** (acta + soporte) para descargar o, más adelante, enviar por correo.

Stack: Vercel (funciones Node 22) · MySQL en Hostinger · Anthropic API · Chromium para el PDF. Los usuarios entran con su cuenta de Silogtran (la contraseña no se guarda).

> **Repo público**: no contiene claves, PDF, firmas, logos ni datos de conexión. Esos datos viven en variables de entorno y en la base de datos.

## Documentación
Todo el detalle (reglas de negocio, validaciones, arquitectura, despliegue, verificado/pendiente) está en [`CLAUDE.md`](./CLAUDE.md).

## Uso rápido (desarrollo)
```bash
npm install
npm test
cp .env.example .env   # completar; nunca subir .env
ACTAS_MOCK=1 node scripts/dev-server.mjs   # servidor local con datos de ejemplo de fixtures/ (ver CLAUDE.md)
```

## Despliegue
Vercel conectado a este repo (cada push a la rama de producción despliega). Variables requeridas: ver `.env.example`. La primera vez, entrar a `/config.html` () para subir el logo, la firma y revisar los valores fijos de cada tipo.

## Estado
Funcionando en producción hasta la lectura con IA y el PDF; pendientes: probar una orden DEIPO real, correo Microsoft 365 y primer lote real. Ver «Pendientes» en `CLAUDE.md`.
