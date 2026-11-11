# agente_Actas_Drummond_Elogia

Sistema web que, a partir de números de **remesa** (Excel o digitados) y un **consecutivo** por remesa, baja de **Silogtran** el PDF de soporte de cada remesa, lo lee con IA, deja que una persona lo revise y apruebe, genera el **acta de entrega** (4 tipos) y entrega **un solo PDF por remesa** (acta + soporte) para descargar (uno, o varios en ZIP). Cliente final: Elogia Soluciones Logísticas (servicios a Drummond). Idioma de la interfaz: español.

> Estado (2026-11-11): **desplegado en producción en Vercel y funcionando** hasta la lectura con IA y la generación del PDF. Las 4 actas (incluida **DEIPO**) están implementadas. Falta probar el login con un usuario real de Silogtran, un lote real y una orden DEIPO real, y el correo Microsoft 365. Ver «Verificado / no verificado» y «Pendientes».

## Reglas de trabajo
- El repo es **público**: nunca commitear secretos, claves, cookies, PDF reales, nombres de personas, cédulas, firmas, logos reales ni datos de conexión de la BD. Los valores fijos de las actas viven en la BD (tabla `acta_tipos`); las pruebas locales usan `fixtures/` (en `.gitignore`).
- **Solo lectura** contra Silogtran: nunca grabar, modificar ni «imprimir» nada allí.
- Información sensible y exacta: ante cualquier duda en un dato, la remesa pasa a **revisión humana**; jamás se rellena con un valor supuesto. La revisión humana es obligatoria.
- No inventar respuestas de negocio: ante una regla no documentada, preguntar al dueño y registrarla aquí con fecha.
- Código y comentarios en inglés; mensajes al usuario en español.
- Cada cambio se prueba (`npm test`) antes de subir. Cada push a la rama de producción **despliega a producción**.
- Tras cada incremento, actualizar este archivo (lo verificado contra el sistema real, con fecha).

## Arquitectura
```
Navegador (public/) ── /api/* (funciones Vercel, Node 22, 60 s) ──┬─ Hostinger MySQL  (datos; sin PDF)
                                                                  ├─ Silogtran (GET público del soporte; login solo para identidad)
                                                                  ├─ Anthropic API (lee el PDF escaneado, 2 lecturas)
                                                                  └─ Chromium (@sparticuz/chromium) → acta HTML→PDF; pdf-lib une acta + soporte
```
- **No se guardan PDF**: el soporte se vuelve a bajar de su URL pública y el acta se regenera desde los datos guardados. En la BD solo hay datos (JSON).
- 4 funciones Vercel (límite de 12 en Hobby): `api/health.js`, `api/auth/[action].js`, `api/lotes/[action].js`, `api/actas/[action].js`, `api/admin/[action].js` (dispatchers por `[action]`).
- Cada remesa se procesa en **su propia petición** (nunca un lote entero): el navegador dispara de a 2 y muestra el progreso.

## Mapa del repo
| Ruta | Qué hace |
|---|---|
| `api/` | Funciones HTTP (health, auth, lotes, actas, admin/config). `src/http/route.js` = dispatcher. |
| `src/silogtran/client.js`, `browser.js` | Cliente HTTP de Silogtran (PRADO), login, reto AWS WAF con Chromium. Portado de `grachos/auto_despachos_silogtran`. |
| `src/soporte/descargar.js` | Baja `<remesa>_57.pdf` por URL pública y lo valida (`%PDF`, tipo, tamaño). |
| `src/lectura/leer.js` | Envía el PDF a Claude (herramienta `registrar_lectura`, esquema fijo). |
| `src/validacion.js` | Validaciones de negocio y comparación de las 2 lecturas (código, no IA). |
| `src/procesar.js` | Pipeline por remesa: descarga → 2 lecturas → validar → guardar. Límite 52 s. |
| `src/actas/` | `html.js` (plantilla del acta), `pdf.js` (Chromium), `datos.js` (formatos), `validarEdicion.js`, `final.js` (acta + soporte). |
| `src/store/` | Acceso a MySQL (usuarios, actas/lotes, config por tipo, cookies WAF). `src/db.js` crea el esquema solo. |
| `src/lib/` | `numeros.js` (dinero en enteros), `fechas.js` (Bogotá). |
| `db/*.sql` | Esquema (idempotente, se aplica al primer uso). |
| `public/` | Front estático: `index.html`+`app.js` (aplicación), `config.html`+`config.js` (configuración). |
| `scripts/` | `dev-server.mjs` (servidor local tipo Vercel), `migrate.mjs`, `seed-config.mjs`, `demo-acta.mjs`. |
| `tests/` | 18 pruebas (`npm test`); las de BD corren si existe `TEST_DATABASE_URL`. |

## Flujo funcional y estados
1. **Entrada**: lote de remesas + consecutivo (una línea `remesa;consecutivo`, o Excel con columnas `remesa` y `consecutivo`). Máx. 500 por lote. Par (remesa, consecutivo) único: los repetidos se omiten.
2. **Procesar** (por remesa): baja el soporte → 2 lecturas con IA en paralelo → validaciones → guarda datos y alertas. Estados: `PENDIENTE → PROCESANDO → LISTA` (sin alertas) | `REVISAR` (con alertas) | `ERROR`. Reclamo atómico (doble clic seguro). Si la función muere, a los 3 min una remesa `PROCESANDO` se muestra como `ERROR/TIMEOUT` y se puede reintentar.
3. **Revisión** (una sola pantalla): soporte de Silogtran a la izquierda (visor PDF del navegador), a la derecha pestañas **Datos** (editables, alertas clicables que saltan a la página de origen) y **Vista previa del acta** (el PDF real del acta, sin el soporte). Editar una acta aprobada la devuelve a `LISTA`.
4. **Aprobar**: individual (Ctrl+Enter = aprobar y pasar a la siguiente; Alt+↑/↓ navegar) o por selección (solo las `LISTA`; las `REVISAR` se aprueban una por una). Queda registrado quién y cuándo.
5. **Descargar**: solo actas `APROBADA`. Un PDF final = acta + soporte sin tocar, nombre `<TIPO>_<remesa>.pdf`. Varias → ZIP armado en el navegador (3 en paralelo).
6. **Correo (Microsoft 365)**: pendiente (I7).

## Silogtran
- Instancia: `https://construproyec.colombiasoftware.net` (`SILOG_BASE_URL`).
- **Login de usuarios**: cada persona entra con su usuario y contraseña de Silogtran; se verifica contra Silogtran y **la contraseña no se guarda** (solo el usuario, para saber quién hizo cada acta). 5 intentos fallidos en 15 min bloquean al usuario (protege su cuenta de Silogtran). El login pasa por el reto AWS WAF (Chromium).
- **Soporte**: URL pública `<SILOG_BASE_URL>/images/imagenes/construproyec/remesa_003/<remesa>_57.pdf`. El sufijo `_57` es **siempre 57** (confirmado por el dueño; constante `SOPORTE_SUFIJO`). Sin sesión y sin reto WAF (verificado desde Vercel). 404 → `NO_ATTACHMENT`; no-PDF → `NOT_A_PDF`.
- Plan B (no implementado): pantalla `Despacho.Remesa_003.Buscar` → adjunto `ItemsArchivosAdjuntos` (etiqueta `ctl0_MainModule_ItemsArchivosAdjuntos_ctl0_archivo_label`).
- Riesgo a vigilar: si Silogtran vuelve a subir el adjunto con otro número (p. ej. `_58`), el sufijo fijo traería contenido viejo.

## El PDF soporte
Escaneado (EPSON Scan, 200 ppp, **sin capa de texto**), 4–6 páginas, con sellos y escritos a mano. Número y orden de páginas varían: la IA clasifica por contenido.

| Documento | Cómo reconocerlo | Datos que se usan |
|---|---|---|
| Remesa terrestre de carga (3 copias) | «REMESA TERRESTRE DE CARGA», `No.` | número, fecha, placa |
| Bill of Inland | «BILL OF INLAND» | `# BILL OF INLAND` (ej. `SMR025SEP26`), `CARGO CONSIGNMENT` (= remesa), `DATE OF DISPATCH`, placa, `PO. TRANSPORT` (ej. `500284486A L12` = orden + **línea 12**; puede listar **varias líneas**) |
| Orden de salida Drummond (**opcional**) | «ORDEN DE SALIDA - …» | placa |
| Transport Request Form (uno o varios) | «TRANSPORT REQUEST FORM» | solo informativo (número a veces ilegible) |
| Orden de compra | «Purchase Order» **o** «Orden de Compra» | número con prefijo, líneas (n.º, descripción, cantidad, `PO Price`, `Extended Amt`) |

**El prefijo de la orden decide el tipo de acta** (`DEIPO`, `CMLTD`, `CPLTD`, `EDLTD`).

Muestras analizadas (datos reales solo en local): CPLTD `0101219771` (línea 8), CPLTD `0101219749` (línea 12, 2 TRF), CMLTD `0101219775` (orden en español, 1 línea de 9 viajes, sin orden de salida). Hallazgos: el `L<n>` del Bill = `Lín-Env` de la orden (3 de 3); la descripción de la línea no tiene formato único (se transcribe y se revisa); el conductor puede diferir entre remesa y Bill (no se valida); el Bill puede traer la orden sin prefijo y el TRF sin cero inicial.

## Lectura y validaciones
- **Lectura**: PDF directo a Claude (`IA_MODELO`, por defecto `claude-sonnet-5-5`). El modelo **rechaza `tool_choice` forzado**, por eso se instruye el uso de la herramienta y se verifica el bloque `tool_use`. Valores «tal cual impresos»; `null` + `campos_dudosos` si no es legible (nunca adivinar). Incluye la página de origen de cada documento. Timeout 35 s, sin reintentos.
- **Dos lecturas** independientes; si difieren en un campo crítico → alerta. Validaciones por código (cualquier fallo → `REVISAR`):
  - remesa leída y `CARGO CONSIGNMENT` = remesa pedida;
  - prefijo ∈ {DEIPO, CMLTD, CPLTD, EDLTD};
  - orden del Bill = orden de compra **sin prefijo** ni ceros iniciales;
  - cada línea del Bill existe en la orden y `PO Price ÷ (Extended Amt ÷ Quantity)` es un **entero ≥ 1** (ese entero es la cantidad facturada);
  - placa igual en remesa, Bill (y orden de salida si viene), formato `AAA999`;
  - fecha de despacho válida (y coincidente con la de la remesa si ambas se leen); código Bill con forma `AAA999MMMAA`.
- Dinero en **enteros** (nunca flotantes): la orden usa formato `4,536,000.00`, el acta `4.536.000` y cantidades `1,00`.
- Se guarda siempre la lectura (JSON), las alertas, el dato aprobado y quién aprobó.

## Las 4 actas
Se generan con una **plantilla HTML** (`src/actas/html.js`) renderizada a PDF con Chromium, fiel al modelo Word del cliente (encabezado SIG-1639 repetido en cada página, tablas, cláusulas, firmas). Los modelos Word originales eran plantillas de combinación de correspondencia; **no están en el repo** (traen nombres, cédula y firma). Dos variantes en la misma plantilla (`cfg.variante`): **DLTD** (CMLTD, CPLTD, EDLTD) y **DEI** (DEIPO). DEIPO (modelo `DEIPO_003`, 2026-11-11) difiere así: encabezado `SIGDEI-0331` / `03-02-2022`; empresa «DRUMMOND ENERGY INC.» (DEI); **contratista = Elogia** (ya no UT American Logistic); **el «Objeto del servicio» se deja en blanco** (campo por acta, opcional y editable en la revisión; no se lee de la orden; confirmado por el dueño 2026-11-11; la bandera de la config se llama `objetoDeOrden` por razones históricas); cláusula 6 sin «a satisfacción»; «Manual de Contratistas»; bloque de 5 firmas (Contratista, Director/Superintendente, Bodega, Gerente de área, Country Manager). Puede haber **más de una línea de la orden de compra** por remesa (el modelo DEIPO traía 2): el Bill lista varias líneas en `PO. TRANSPORT` (ej. `… L1 L2`) y el acta lleva **una fila por línea** (cada línea con su cantidad facturada calculada; hasta 6). Vale para todos los tipos. La cédula del representante es fija por tipo, como en el modelo. **Falta una remesa DEIPO real** para confirmar cómo el Bill lista varias líneas.

| Tipo | Empresa | Contrato (fijo) | Sede (fija, por confirmar) |
|---|---|---|---|
| DEIPO | Drummond Energy Inc (DEI) | DCI-2311 | Mina (modelo) |
| CMLTD | Drummond Ltd (DLTD) | DCI-2418 | Mina |
| CPLTD | Drummond Ltd (DLTD) | DCI-2418 | Puerto |
| EDLTD | Drummond Ltd (DLTD) | DCI-1786 | Mina |

**Valores fijos por tipo** (BD, editables en `/config.html`): contratista, objeto (salvo DEIPO), empresa, supervisor, **planeador = N/A**, comprador, **AFE = N/A**, representante y cédula del contratista, representante de Drummond, nombre bajo la firma, contrato y sede; solo DEIPO: nombres de Director, Gerente de área y Country Manager, código y fecha del formato. El **logo y la firma** son imágenes compartidas (fila `_COMUN`) que se suben en `/config.html`. El DCI de la orden (p. ej. `DCI-2410B`) **se ignora**: el contrato es fijo por tipo.

**Variables por acta** (editables en la revisión):
| Campo | Origen / regla |
|---|---|
| Consecutivo | lo da el usuario (Excel o pantalla) |
| Orden de compra | página de la orden (con prefijo) |
| Línea(s) / descripción | línea(s) de la orden indicadas en el Bill; descripción **tal cual, incluida la «JURISDICCIÓN: …»** (confirmado 2026-11-11; corrige la decisión anterior de omitirla) |
| Cantidad de la orden | `Quantity` impresa (`3.00EA` → `3,00`) |
| Valor unitario | `Extended Amt ÷ Quantity` (normalmente igual al `PO Price` impreso) |
| Cantidad facturada | **valor del medio (`PO Price`) ÷ valor unitario**, con valor unitario = `Extended Amt ÷ Quantity` (regla del dueño, confirmada con ejemplo 2026-11-11, igual para los 4 tipos): normalmente el valor unitario **es** el del medio → **1**; ejemplo: total 200, cantidad 4 → unitario 50; valor del medio 150 → facturada **3** y valor a facturar 3 × 50 = **150**. Debe ser un entero ≥ 1; si no, revisión |
| Valor total facturado | cantidad facturada × valor unitario (se recalcula al editar; es igual al valor del medio) |
| Fecha de inicio y de terminación | la misma: `DATE OF DISPATCH` del Bill |
| Fecha del acta y cierre en letras | la misma: **hoy** (America/Bogotá), editable |
| Documentos adjuntos | `<código Bill> BILL OF INLAND – TRF – ORDEN DE COMPRA <número>` |

Correcciones a los modelos ya aplicadas en la plantilla: sin el «JUN(» suelto; ejemplo «(ej: mails internos… paz y salvos, otros)» completo y aparte; cláusula 4 y párrafo del «Manual Integral…» completos en todos; fecha del acta = fecha del cierre; «Angélica Cuao» y «días» bien escritos; «identificada».

## Modelo de datos (MySQL, `db/*.sql`, utf8mb4)
`usuarios` (identidad Silogtran, sin clave) · `lotes` · `actas` (remesa, consecutivo, tipo, estado, error, `lectura`/`alertas`/`datos` JSON, aprobado_por/en; único por remesa+consecutivo) · `acta_tipos` (config JSON por tipo + `_COMUN` con logo/firma) · `waf_cookies` · `login_intentos`. El esquema se crea solo (`src/db.js`, idempotente) y, si la variable `ACTAS_SEED` trae JSON `{TIPO:{...}}`, se **agregan los tipos que falten** (nunca sobrescribe lo ya editado en la BD).

## API (todas exigen sesión salvo health y login)
`GET /api/health` · `POST /api/auth/login|logout`, `GET /api/auth/me` · `POST /api/lotes/crear`, `GET /api/lotes/listar|ver` · `POST /api/actas/procesar|guardar|aprobar|desaprobar`, `GET /api/actas/obtener|soporte|vistapdf|pdf` · `/api/admin/config|tipo|imagen` (sesión **y** cabecera `x-admin-key`). La sesión es una cookie firmada (`TOKEN_SECRET`, 8 h). Los datos editados se validan en el servidor (`validarEdicion.js`).

## Configuración y despliegue
- **Variables** (ver `.env.example`): `DATABASE_URL`, `TOKEN_SECRET`, `ADMIN_KEY`, `ANTHROPIC_API_KEY`, `SILOG_BASE_URL`, `SOPORTE_SUFIJO`; opcionales `IA_MODELO`, `DATABASE_SSL`, `WAF_*`, `SILOG_TIMEOUT_SEC`; correo (I7) por definir. Solo local: `ACTAS_MOCK=1`.
- **Hostinger**: base MySQL **propia** de este proyecto (no se tocaron las otras bases de la cuenta), con acceso remoto `%` porque Vercel no tiene IP fija. Datos de conexión solo en `DATABASE_URL` (Vercel). Endurecer más adelante si hay IP fija o un túnel.
- **Vercel**: proyecto `agente_actas_drummond` ligado a este repo. **La rama de producción hoy es `claude/blissful-cray-f70po1`** (cada push despliega). Variables sensibles: no se pueden volver a leer; si se pierde `ADMIN_KEY`, se rota (API/MCP de Vercel o panel) y se vuelve a desplegar. La protección «Vercel Authentication» debe estar **apagada** para que los usuarios entren (la app tiene su propio login).
- **Primera puesta en marcha**: entrar → `/config.html` (clave de administrador) → subir logo y firma → revisar los valores fijos.
- **Operación**: los tiempos quedan en los registros de Vercel (`[procesar] descarga … ms`, `lectura x2 … ms`); errores por remesa en pantalla.

## Desarrollo local
```bash
npm install
npm test                                   # 18 pruebas (las de BD con TEST_DATABASE_URL=mysql://...)
ACTAS_MOCK=1 DATABASE_URL=mysql://... TOKEN_SECRET=x WAF_CHROME_PATH=/ruta/chrome node scripts/dev-server.mjs
```
Con `ACTAS_MOCK=1` el servidor local usa `fixtures/soporte/<remesa>.pdf`, `fixtures/lecturas/<remesa>.json` y `fixtures/config.local.json` (cargar con `scripts/seed-config.mjs`) en vez de Silogtran/IA; login de prueba: cualquier usuario con clave `demo`. Ignorado en Vercel.

## Verificado / no verificado (2026-11-11)
**Verificado en producción (Vercel):** conexión a Hostinger y esquema; descarga del soporte (sin WAF); lectura real con Claude de `0101219771` y `0101219749` (tipo, validaciones sin alertas, páginas correctas); PDF del acta con Chromium (~52 KB); `0101219775` en el servidor devuelve el PDF de `0101219771` y la validación lo bloqueó (comportamiento correcto). **Verificado en local:** flujo completo con navegador automatizado (login → lote → procesar → revisar → aprobar → PDF final; acta no aprobada → 409), PDF de vista previa de 2 páginas carta, tiempos y reintentos.
**No verificado:** login con un usuario real de Silogtran; visor de PDF en un navegador real (el automatizado no tiene visor; si falla, usar PDF.js); ZIP y lectura de Excel (librerías por cdnjs); tiempo real de una remesa (cabe en 60 s si la IA tarda < 35 s); lotes de 100–300; frecuencia de `REVISAR` por doble lectura en escaneados reales (**primer lote real: 5–10 remesas mirando los registros**).

## Pendientes y siguientes pasos
1. Apagar «Vercel Authentication», subir logo y firma, primer lote real de 5–10 remesas.
2. Probar una **remesa DEIPO real** (varias líneas en el Bill, objeto en blanco).
3. **Correo Microsoft 365** (I7): Graph `sendMail`, app de Azure (`Mail.Send`) y buzón remitente; envío individual o por bloques (≈20 MB por correo), registro de envíos.
4. Revisar con el dueño qué hay en Silogtran para `0101219775` y si re-subir un adjunto cambia el sufijo.
5. Si hace falta: PDF.js como visor, tope por lote, manual de uso, endurecer el acceso remoto a la BD.
6. Si se quiere dar de baja la rama de producción actual: pasar a `main` (fusionar) y cambiar la rama de producción en Vercel.

## Preguntas abiertas / recordatorios para el dueño
- **Sede fija por tipo** (CPLTD = Puerto, los demás = Mina): ¿confirmado?
- **Una remesa real de DEIPO** (PDF de soporte) y de EDLTD, y una de escaneo poco legible.
- Datos del correo (cuenta Azure y buzón remitente) cuando se llegue a I7.

## Decisiones del dueño (resumen con fecha)
- 2026-11-10/11: el prefijo de la orden decide el tipo; una acta por remesa; salida en PDF; consecutivo por Excel o pantalla; nombres fijos por tipo; contrato fijo por tipo; planeador y AFE = N/A; cantidad facturada = 1; fecha de servicio = despacho del Bill; fecha del acta = hoy; descripción tal cual; sufijo del soporte siempre `_57`; IA = Anthropic; Vercel + base MySQL de Hostinger; cada usuario entra con su cuenta de Silogtran; 4–6 usuarios, lotes de 100–300; correo Microsoft 365; nombre del archivo `<TIPO>_<remesa>.pdf`; revisión en una sola pantalla con vista previa en PDF.
- 2026-11-11 (prueba en la app): la **descripción incluye la jurisdicción**; en DEIPO el **objeto del servicio queda en blanco**; una remesa puede tener **varias líneas** de la orden (una fila por línea en el acta).
- 2026-11-11: cantidad facturada = `PO Price ÷ (Extended Amt ÷ Quantity)` para todos los tipos (1 normalmente; 2, 3… 20 si el valor del medio es esas veces el valor unitario); ejemplo del dueño: total 200, cantidad 4, medio 150 → unitario 50, facturada 3, valor a facturar 150. DEIPO usa la misma lógica (el modelo con «30 de la orden / 25 facturadas» es solo ilustrativo). Una versión anterior de esta regla estaba invertida y se corrigió.
