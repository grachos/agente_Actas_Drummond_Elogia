# agente_Actas_Drummond_Elogia

Sistema que, a partir de números de remesa, baja de **Silogtran** el PDF adjunto de cada remesa, lee sus datos, genera el **acta de entrega** (4 tipos) y arma un PDF final (acta + soporte) para descargar o enviar por correo. Cliente final: Elogia Soluciones Logísticas (servicios a Drummond).

> Estado: **planeación cerrada, sin código**. Empezar por el incremento I0. Las preguntas abiertas están al final; no inventar respuestas: preguntar al dueño.

## Reglas de trabajo
- El repo es **público**: nunca commitear secretos, cookies, PDF reales, HTML capturado, nombres de personas ni cédulas. Los datos fijos de las actas (nombres, cédula) viven en Supabase, no en el código. Fixtures reales solo en local (`fixtures/` está en `.gitignore`).
- Este proyecto es **solo lectura** contra Silogtran: nunca grabar, modificar ni «imprimir» nada allí.
- Trabajar por incrementos pequeños; cada uno se prueba y lo aprueba el dueño antes del siguiente.
- La información es sensible y debe ser exacta: ante duda en un dato, el acta se **bloquea** y pasa a revisión humana; nunca se rellena con un valor supuesto.
- Mensajes al usuario en español; código y comentarios en inglés (igual que el repo de referencia).
- Tras cada incremento, registrar aquí lo verificado contra el sistema real (con fecha).

## Referencia técnica: `grachos/auto_despachos_silogtran`
Repo público con el acceso a Silogtran ya resuelto. **Portar tal cual** (no reescribir):
- `src/silogtran/client.js`: cliente HTTP (PRADO/PHP, sin API), cookies, login con centro de costo, `formFields`, reto **AWS WAF** resuelto con Chromium (`browser.js`, `@sparticuz/chromium` + `puppeteer-core`). Peticiones en serie (`enqueue`).
- `src/silogtran/session.js` + `src/store/sessionStore.js` + migración `001_silog_session.sql`: sesión guardada en Supabase para no relogear.
- `src/silogtran/prado.js`: postbacks/callbacks PRADO.
- `src/silogtran/imprimir.js`: patrón «pulsar botón → leer enlace del PDF» (útil si el adjunto se descarga parecido).
- Patrón de **diagnósticos de solo lectura** (`src/routes/admin/diag-*.js`): antes de automatizar una pantalla, un endpoint devuelve su estructura (campos, botones, enlaces) y el dueño la ejecuta contra el sistema real.
- `vercel.json` (60 s por función, `includeFiles` de Chromium, cabeceras) y `scripts/check-functions.mjs` (límite de 12 funciones en Vercel Hobby: usar dispatchers `api/x/[action].js`).

Instancia: `https://construproyec.colombiasoftware.net` (`SILOG_BASE_URL`).

## Stack (por defecto; pendiente de confirmar)
Node 22 ESM, Vercel (funciones serverless) + Supabase (Postgres + Storage privado). Front estático en `public/` (HTML/JS sin framework, como la referencia). `pdf-lib` para unir PDF. Chromium (el mismo del WAF) para renderizar el acta HTML → PDF. IA de visión para leer el escaneado: **Anthropic (Claude API)**, confirmado por el dueño; modelo por variable de entorno (`ANTHROPIC_API_KEY`, `IA_MODELO`).

## Flujo funcional
1. Entrada: remesas + **consecutivo del acta** por cada una, por Excel (columnas `remesa`, `consecutivo`) o digitadas en la pantalla.
2. Por cada remesa: abrir sesión Silogtran → buscar la remesa → descargar el PDF adjunto.
3. Leer el PDF (escaneado) → datos estructurados → validaciones.
4. Revisión humana: datos leídos junto a la imagen de la página; la persona corrige/aprueba.
5. Generar el acta (PDF) del tipo que corresponda.
6. PDF final = acta + PDF soporte descargado (mismo archivo, sin tocar).
7. Descargar (uno o lote) o enviar por correo (uno por correo o en bloques).

Una remesa = un acta. Cada remesa se procesa en su propia invocación (límite de 60 s): el lote es una tabla de trabajos que el front va disparando uno a uno; nunca un lote entero en una sola petición.

## Descarga del adjunto en Silogtran (dicho por el dueño; falta verificar el HTML)
- Pantalla: `index.php?page=Despacho.Remesa_003.Buscar` → buscar el número de remesa → en la ficha, clic en la etiqueta `ctl0_MainModule_ItemsArchivosAdjuntos_ctl0_archivo_label` (primer adjunto del repetidor `ItemsArchivosAdjuntos`).
- El soporte es **solo** el adjunto cuyo nombre es `<remesa>_<n>.pdf` (ej. `0101219771_57.pdf`); el sufijo `_<n>` lo pone Silogtran y no significa nada. Cualquier otro adjunto se ignora. Si ninguno o más de uno cumple el patrón → error y revisión (confirmado por el dueño 2026-11-10).
- **Sin verificar**: nombres de los campos del buscador, si el clic es enlace directo, postback o `window.open`, y cómo se ve el nombre del archivo en la lista de adjuntos. → Resolver con el diagnóstico de I1 antes de programar la descarga.
- Validar la descarga: `content-type` PDF, cabecera `%PDF`, mismo origen, tamaño > 0.

## El PDF soporte (muestra real analizada 2026-11-10)
Escaneado con EPSON Scan, 200 ppp, **sin capa de texto** (imágenes CCITT blanco/negro y alguna JPEG a color), 5 páginas. Legibilidad variable; hay sellos, firmas y vistos a mano encima del texto. El orden de páginas **no se asume**: clasificar cada página por su contenido.

| Documento | Cómo reconocerlo | Datos |
|---|---|---|
| Remesa terrestre de carga (3 copias en una hoja) | «REMESA TERRESTRE DE CARGA», `No.` | número de remesa, fecha (año/mes/día), placa, conductor, remitente, destinatario, origen/destino |
| Bill of Inland | título «BILL OF INLAND» | `# BILL OF INLAND` (ej. `SMR025SEP26`), `CARGO CONSIGNMENT` (= remesa), `DATE OF DISPATCH`, placa, `PO. TRANSPORT` (ej. `500284486A L8` = orden + **línea 8**) |
| Orden de salida Drummond | «ORDEN DE SALIDA - PUERTO DRUMMOND» (u otra sede) | sede, fecha, placa, sello de recibido |
| Transport Request Form | «TRANSPORT REQUEST FORM» | `TRF NUMBER`, fecha |
| Orden de compra | «Purchase Order» **o** «Orden de Compra» (viene en inglés o español) | número con prefijo (`CPLTD-500284486A`, `CMLTD-0100443504`), líneas: n.º de línea, descripción (vehículo tipo, ruta, tipo de carga, jurisdicción), cantidad, precio unitario, total |

Todos los PDF traen la página de la orden de compra; **su prefijo decide el tipo de acta**. Puede venir solo una página de la orden (la que contiene la línea usada).

## Lectura y validaciones (lo más delicado del proyecto)
- Rasterizar cada página (≥200 ppp) y leerla con un modelo de **visión** con salida JSON de esquema fijo; cada campo con su valor, la página de origen y `null` si no se lee (prohibido adivinar). Dos lecturas independientes de los campos críticos (orden de compra, línea, cantidad, precio, total, remesa, Bill of Inland, fecha); si difieren → revisión.
- Validaciones por código (no por IA); cualquier fallo marca el campo y bloquea la generación automática:
  - remesa leída (remesa y `CARGO CONSIGNMENT`) = remesa solicitada = nombre del archivo;
  - prefijo de la orden ∈ {DEIPO, CMLTD, CPLTD, EDLTD};
  - la orden del Bill of Inland coincide con la de la página de orden de compra;
  - la línea indicada existe en la página y **cantidad × precio = total** de esa línea (detecta dígitos mal leídos);
  - placa igual en remesa, Bill of Inland y orden de salida; formato `AAA999`;
  - fechas válidas y coherentes entre documentos; código Bill of Inland con forma `AAA999MMMAA`.
- Números: la orden usa formato anglosajón (`4,536,000.00`); el acta usa formato colombiano (`4.536.000`, cantidades `1,00`). Convertir con enteros, nunca con flotantes.
- La revisión humana es obligatoria en la primera versión, aunque todo valide.
- Guardar siempre el JSON leído, el resultado de validaciones y quién aprobó (auditoría).

## Las 4 actas
Modelos entregados por el dueño en Word (ya diligenciados; no están en el repo). Se reconstruyen como **plantillas HTML** con marcadores, fieles al Word (logos, tablas, firmas), y se renderizan a PDF tamaño carta.

| Tipo | Empresa (sigla en el texto) | Contratista | Contrato | Sede del modelo | Firmas |
|---|---|---|---|---|---|
| DEIPO | Drummond Energy Inc (DEI) | UT American Logistic | DCI-2311 | Mina Drummond | bloque propio (5 firmas: contratista, director/superint., bodega, gerente de área, country manager) |
| CMLTD | Drummond Ltd (DLTD) | Elogia Soluciones Logísticas SAS | DCI-2418 | Mina Drummond | bloque DLTD |
| CPLTD | Drummond Ltd (DLTD) | Elogia Soluciones Logísticas SAS | DCI-2418 | Puerto Drummond | bloque DLTD |
| EDLTD | Drummond Ltd (DLTD) | Elogia Soluciones Logísticas SAS | DCI-1786 | Mina Drummond | bloque DLTD |

**Fijos por tipo** (tabla de configuración en Supabase, editable; no en el repo): contratista, objeto del servicio, supervisor/solicitante, planeador, comprador, representante del contratista y su cédula, representante de Drummond, nombres del bloque de firmas, contrato, AFE (`N/A`).

**Variables por acta:**
| Campo del acta | Origen |
|---|---|
| Número de consecutivo (ej. `CPLTD-053-26`) | Excel o pantalla |
| Orden de compra N° | página de orden de compra |
| Línea, descripción, cantidad de la orden, valor unitario | línea de la orden indicada en el Bill of Inland |
| Cantidad facturada / valor total facturado | 1 por remesa → total = valor unitario (**supuesto, confirmar**) |
| Fecha de inicio de los servicios | fecha de despacho (remesa / Bill of Inland) |
| Fecha de terminación | **pendiente** (el sello de recibido no se lee; en 3 de 4 modelos = inicio) |
| Sede | orden de salida / orden de compra (**confirmar** si es fija por tipo) |
| Documentos adjuntos | `<código Bill of Inland> BILL OF INLAND – TRF – ORDEN DE COMPRA <número>` |
| Fecha del acta y cierre en letras («a los N días del mes de MES del año AAAA») | fecha en que se elabora el acta (día de generación, America/Bogota), editable en la revisión (confirmado 2026-11-10) |

Descripción de la línea en el acta: `SERVICIO DE TRANSPORTE TERRESTRE DE CARGA VEHICULO TIPO: <tipo> RUTA: <ruta> TIPO DE CARGA: <carga>` (sin la jurisdicción, como en los modelos).

**Correcciones a los modelos pedidas por el dueño** (aplicar en las plantillas):
- quitar el «JUN(» suelto antes de «(ej: mails internos…)» y restaurar ese texto de ejemplo completo y separado de la lista de adjuntos;
- CPLTD: restaurar la cláusula 4 completa y el párrafo del «Manual Integral para Control y Seguimiento de Contratistas», iguales a CMLTD/EDLTD;
- fecha del acta (arriba) y fecha del cierre en letras siempre la misma, y el año correcto;
- nombre «Angélica Cuao» bien escrito y uniforme; «días» con tilde; género coherente («la Señora… identificada»).

## Modelo de datos (Supabase)
- `silog_session`: igual que la referencia.
- `acta_tipos`: prefijo (PK) + JSON de campos fijos.
- `lotes`: id, creado_por, creado_en, estado.
- `actas`: id, lote_id, remesa, consecutivo, tipo, estado (`PENDIENTE|DESCARGADA|LEIDA|EN_REVISION|APROBADA|GENERADA|ENVIADA|ERROR`), código de error, datos leídos (JSON), validaciones (JSON), datos aprobados (JSON), aprobado_por/en, rutas en Storage (soporte, acta, final). Único (`remesa`, `consecutivo`); reprocesar no duplica.
- Storage privado: `soportes/`, `actas/`, `finales/`; descargas con URL firmada de corta vida.
- `usuarios` de la aplicación y `envios` (correo: destinatarios, adjuntos, estado).

## Incrementos
- **I0 Base**: estructura del repo, portar cliente Silogtran + sesión + WAF, migraciones, `GET /api/health` (config, Supabase, WAF, login). Sin UI.
- **I1 Diagnóstico de remesa (solo lectura)**: endpoint admin que abre `Despacho.Remesa_003.Buscar`, devuelve campos del formulario, y para una remesa dada la estructura de la ficha y del bloque `ItemsArchivosAdjuntos` (ids, textos, href/onclick). El dueño lo corre y pega el resultado.
- **I2 Descarga del adjunto**: `descargarSoporte(remesa)` → PDF validado en Storage. Errores fijos: `REMESA_NOT_FOUND`, `NO_ATTACHMENT`, `MULTIPLE_ATTACHMENTS`, `NOT_A_PDF`.
- **I3 Lectura**: rasterizado, clasificación de páginas, extracción con visión, validaciones, pruebas unitarias de validaciones y conversión numérica; medir precisión con las muestras reales del dueño (en local) antes de seguir.
- **I4 Actas**: 4 plantillas HTML + render a PDF + fecha en letras + formato numérico; comparar visualmente con los modelos Word.
- **I5 Ensamble**: acta + soporte con `pdf-lib`; nombre de archivo acordado.
- **I6 Aplicación web**: inicio de sesión, carga por Excel/manual, tablero del lote con estados, pantalla de revisión (datos + imagen de la página), descarga individual y por lote (ZIP o un solo PDF).
- **I7 Correo**: envío individual o por bloques respetando el tamaño máximo de adjunto; registro de envíos.
- **I8 Cierre**: límites de intentos, auditoría, manual de uso, pruebas de punta a punta con remesas reales.

## Variables de entorno (sin valores en el repo)
`SILOG_BASE_URL`, `SILOG_USER`, `SILOG_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_KEY`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `IA_MODELO`, credenciales del proveedor de correo. Opcionales: `WAF_CHROME_PATH`, `WAF_WAIT_SEC`, `SILOG_TIMEOUT_SEC`.

## Preguntas abiertas (preguntar al dueño; no asumir)
1. Línea de la orden: ¿siempre sale del `L<n>` del Bill of Inland?
2. Fecha de terminación de los servicios: ¿igual a la de despacho, o se digita?
3. Contrato (DCI) y AFE: ¿fijos por tipo?
4. Cantidad facturada: ¿siempre 1 por remesa?
5. Sede: ¿fija por tipo o leída del PDF?
6. Usuarios de la aplicación, remesas por lote, cuenta y destinatarios de correo, nombre del archivo final, fecha de entrega.
7. Faltan muestras reales de DEIPO, CMLTD y EDLTD y una poco legible.
