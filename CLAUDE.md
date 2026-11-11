# agente_Actas_Drummond_Elogia

Sistema que, a partir de números de remesa, baja de **Silogtran** el PDF adjunto de cada remesa, lee sus datos, genera el **acta de entrega** (4 tipos) y arma un PDF final (acta + soporte) para descargar o enviar por correo. Cliente final: Elogia Soluciones Logísticas (servicios a Drummond).

> Estado: **código inicial listo y probado en local** (ver «Estado de implementación»). Las preguntas abiertas están al final; no inventar respuestas: preguntar al dueño.

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
**Decidido 2026-11-11: Vercel** (funciones serverless, 60 s) + **BD MySQL en Hostinger** (la del dueño; `DATABASE_URL`; requiere habilitar acceso remoto y permitir conexiones desde Vercel, que no tiene IP fija). Como Vercel no permite LibreOffice, las actas se hacen con **plantillas HTML renderizadas a PDF con Chromium** (`@sparticuz/chromium`, el mismo del WAF), fieles a los modelos Word. **No se guardan PDF**: el soporte se vuelve a bajar de la URL pública y el acta se regenera desde los datos aprobados; en la BD solo van datos (JSON). La IA lee el **PDF directo** (la API de Anthropic acepta PDF escaneados; sin rasterizar). Node 22 ESM; front estático en `public/`; `pdf-lib` para unir PDF; IA: **Anthropic**, modelo por `IA_MODELO`. Correo: **Microsoft 365** vía Microsoft Graph (`sendMail`) con app de Azure (`Mail.Send`) y buzón remitente.

## Flujo funcional
1. Entrada: remesas + **consecutivo del acta** por cada una, por Excel (columnas `remesa`, `consecutivo`) o digitadas en la pantalla.
2. Por cada remesa: abrir sesión Silogtran → buscar la remesa → descargar el PDF adjunto.
3. Leer el PDF (escaneado) → datos estructurados → validaciones.
4. Revisión humana: datos leídos junto a la imagen de la página; la persona corrige/aprueba.
5. Generar el acta (PDF) del tipo que corresponda.
6. PDF final = acta + PDF soporte descargado (mismo archivo, sin tocar).
7. Descargar (uno o lote) o enviar por correo (uno por correo o en bloques).

Una remesa = un acta. **Escala (2026-11-11):** 4–6 usuarios; lotes de 100, 200 o 300 remesas. El lote es una tabla de trabajos en Supabase; un procesador toma pocos a la vez (concurrencia 2–3, peticiones a Silogtran en serie por sesión), cada remesa pasa a su propio estado y un fallo no detiene el lote; reintento manual por remesa. Nunca un lote entero en una sola petición.

## Descarga del adjunto en Silogtran (dicho por el dueño; falta verificar el HTML)
- Pantalla: `index.php?page=Despacho.Remesa_003.Buscar` → buscar el número de remesa → en la ficha, clic en la etiqueta `ctl0_MainModule_ItemsArchivosAdjuntos_ctl0_archivo_label` (primer adjunto del repetidor `ItemsArchivosAdjuntos`).
- El soporte es **solo** el adjunto cuyo nombre es `<remesa>_<n>.pdf` (ej. `0101219771_57.pdf`); el sufijo `_<n>` lo pone Silogtran y no significa nada. Cualquier otro adjunto se ignora. Si el GET devuelve 404 o algo que no es PDF → `NO_ATTACHMENT`/`NOT_A_PDF` y revisión (confirmado por el dueño 2026-11-10).
- **Sin verificar**: nombres de los campos del buscador, si el clic es enlace directo, postback o `window.open`, y cómo se ve el nombre del archivo en la lista de adjuntos. → Resolver con el diagnóstico de I1 antes de programar la descarga.
- **URL pública del soporte (dicho por el dueño 2026-11-10; no verificado desde el entorno de planeación, cuyo proxy bloquea ese host):** `<SILOG_BASE_URL>/images/imagenes/construproyec/remesa_003/<remesa>_<n>.pdf` (ej. `.../remesa_003/0101219775_57.pdf`). Si es accesible sin sesión, la descarga es un GET simple y no requiere login para ese paso; **aun así** hay que confirmar si el reto AWS WAF también aplica a esa ruta (usar el cliente con manejo de WAF). **El sufijo es siempre `_57` (confirmado por el dueño 2026-11-10): construir la URL como `<remesa>_57.pdf`**, en una constante configurable (`SOPORTE_SUFIJO=57`). La navegación por la ficha (`Remesa_003.Buscar`) queda solo como plan B si la URL directa falla (WAF o sesión); I1 sigue siendo útil para confirmarlo.
- **Verificado 2026-11-10 (curl del dueño, sin sesión, desde un computador):** `HTTP 200`, `content-type: application/pdf`, servidor Apache, sin reto WAF. Falta repetirlo **desde Vercel** (IP de datacenter), donde el WAF sí podría responder `x-amzn-waf-action: challenge`: usar el cliente con manejo de WAF y, si hace falta, resolverlo con Chromium como en la referencia.
- Validar la descarga: `content-type` PDF, cabecera `%PDF`, mismo origen, tamaño > 0.

## El PDF soporte (muestra real analizada 2026-11-10)
Escaneado con EPSON Scan, 200 ppp, **sin capa de texto** (imágenes CCITT blanco/negro y alguna JPEG a color), 5 páginas. Legibilidad variable; hay sellos, firmas y vistos a mano encima del texto. El orden de páginas **no se asume**: clasificar cada página por su contenido.

| Documento | Cómo reconocerlo | Datos |
|---|---|---|
| Remesa terrestre de carga (3 copias en una hoja) | «REMESA TERRESTRE DE CARGA», `No.` | número de remesa, fecha (año/mes/día), placa, conductor, remitente, destinatario, origen/destino |
| Bill of Inland | título «BILL OF INLAND» | `# BILL OF INLAND` (ej. `SMR025SEP26`), `CARGO CONSIGNMENT` (= remesa), `DATE OF DISPATCH`, placa, `PO. TRANSPORT` (ej. `500284486A L8` = orden + **línea 8**) |
| Orden de salida Drummond (**opcional**: no viene en CMLTD) | «ORDEN DE SALIDA - PUERTO DRUMMOND» (u otra sede) | sede, fecha, placa, sello de recibido |
| Transport Request Form | «TRANSPORT REQUEST FORM» | `TRF NUMBER`, fecha |
| Orden de compra | «Purchase Order» **o** «Orden de Compra» (viene en inglés o español) | número con prefijo (`CPLTD-500284486A`, `CMLTD-0100443504`), líneas: n.º de línea, descripción (vehículo tipo, ruta, tipo de carga, jurisdicción), cantidad, precio unitario, total |

Todos los PDF traen la página de la orden de compra; **su prefijo decide el tipo de acta**. Puede venir solo una página de la orden (la que contiene la línea usada). Número y orden de páginas varían (CPLTD 5 páginas con orden de salida; CMLTD 4, sin orden de salida y con sellos de bodega/portería en el Bill).

### Muestras analizadas
- **CPLTD** `0101219771`: orden `CPLTD-500284486A`, 4 líneas; Bill → `500284486A L8` = línea `8- 1` (4 × 4.536.000 = 18.144.000). Bill `SMR025SEP26`.
- **CMLTD** `0101219775`: «Orden de Compra» (español) `CMLTD-0100443504`, una línea `1- 1` «Transporte tubería Concreto 24" & 36" – Agosto 2026, Tipo de Vehículo: Cama Alta, Ruta: Medellín - ED», cantidad 9, precio 6,388,875.00, total 57,499,875.00. Bill `MED003SEP26` → `0100443504 L1` (**sin prefijo**); despacho 02/09/2026; sellos de bodega/portería 03/09/2026; placa `SZK367`.
- Hallazgos: (a) el `L<n>` del Bill coincide con el `Lín-Env` de la orden en 2 de 2 muestras; (b) la descripción de la línea **no tiene formato único** (CPLTD «VEHICULO TIPO/RUTA/TIPO DE CARGA»; CMLTD texto libre) → se transcribe del PDF y se revisa; (c) el conductor difiere entre remesa y Bill en CMLTD → no se valida; (d) TRF de CMLTD poco legible (número tapado, `PO TRANSPORT` sin cero inicial); (e) la orden CMLTD cita `DCI-2410B`; **se ignora**, el contrato es fijo por tipo (`DCI-2418` en el modelo); (f) comprador de la orden coincide con el fijo del acta; sede «Mina Pribbenow» (CMLTD) / «Puerto Drummond» (CPLTD) sugiere sede fija por tipo.

## Lectura y validaciones (lo más delicado del proyecto)
- Rasterizar cada página (≥200 ppp) y leerla con un modelo de **visión** con salida JSON de esquema fijo; cada campo con su valor, la página de origen y `null` si no se lee (prohibido adivinar). Dos lecturas independientes de los campos críticos (orden de compra, línea, cantidad, precio, total, remesa, Bill of Inland, fecha); si difieren → revisión.
- Validaciones por código (no por IA); cualquier fallo marca el campo y bloquea la generación automática:
  - remesa leída (remesa y `CARGO CONSIGNMENT`) = remesa solicitada = nombre del archivo;
  - prefijo de la orden ∈ {DEIPO, CMLTD, CPLTD, EDLTD};
  - la orden del Bill of Inland coincide con la de la página de orden de compra **comparando sin prefijo** (Bill `0100443504 L1` ↔ `CMLTD-0100443504`); el TRF solo informativo (puede perder ceros);
  - la línea indicada existe en la página y `Quantity` × `PO Price` = `Extended Amt` (detecta dígitos mal leídos);
  - placa igual en remesa y Bill of Inland (y en la orden de salida si viene); formato `AAA999`; **no** validar el conductor;
  - fechas válidas y coherentes entre documentos; código Bill of Inland con forma `AAA999MMMAA`.
- Números: la orden usa formato anglosajón (`4,536,000.00`); el acta usa formato colombiano (`4.536.000`, cantidades `1,00`). Convertir con enteros, nunca con flotantes.
- La revisión humana es obligatoria en la primera versión, aunque todo valide.
- Guardar siempre el JSON leído, el resultado de validaciones y quién aprobó (auditoría).

## Las 4 actas
Modelos entregados por el dueño en Word (no están en el repo: traen nombres, cédula y firma). Son **plantillas de combinación de correspondencia** con los mismos campos en los 4 (`GUIA`=código del Bill, `FECHA_DEL_ACTA`, `NUMERO_DE_CONSECUTIVO_DEL_ACTA`, `Cantidad_Facturada_de_la_Orden_de_Compra`…). **Decisión: llenar el propio Word** (python-docx o equivalente, quitando los campos de combinación para dejar texto fijo) y convertirlo a PDF con LibreOffice; probado 2026-11-11 con CMLTD y CPLTD y el resultado es fiel al modelo. CPLTD, DEIPO y EDLTD se derivan de la plantilla corregida (CMLTD tiene el texto completo); DEIPO tiene bloque de firmas y tabla propios. Las plantillas viven en Supabase Storage (privado), no en el repo.

| Tipo | Empresa (sigla en el texto) | Contratista | Contrato | Sede del modelo | Firmas |
|---|---|---|---|---|---|
| DEIPO | Drummond Energy Inc (DEI) | UT American Logistic | DCI-2311 | Mina Drummond | bloque propio (5 firmas: contratista, director/superint., bodega, gerente de área, country manager) |
| CMLTD | Drummond Ltd (DLTD) | Elogia Soluciones Logísticas SAS | DCI-2418 | Mina Drummond | bloque DLTD |
| CPLTD | Drummond Ltd (DLTD) | Elogia Soluciones Logísticas SAS | DCI-2418 | Puerto Drummond | bloque DLTD |
| EDLTD | Drummond Ltd (DLTD) | Elogia Soluciones Logísticas SAS | DCI-1786 | Mina Drummond | bloque DLTD |

**Fijos por tipo** (tabla de configuración en Supabase, editable; no en el repo): contratista, objeto del servicio, supervisor/solicitante, planeador, comprador, representante del contratista y su cédula, representante de Drummond, nombres del bloque de firmas, **contrato (DCI) y AFE: fijos por tipo como en cada modelo (confirmado 2026-11-11); no se leen de la orden** (el `DCI-2410B` citado en la orden CMLTD se ignora).

**Variables por acta:**
| Campo del acta | Origen |
|---|---|
| Número de consecutivo (ej. `CPLTD-053-26`) | Excel o pantalla |
| Orden de compra N° | página de orden de compra |
| Línea, descripción, cantidad de la orden, valor unitario | línea de la orden indicada en el Bill of Inland |
| Cantidad de la orden | `Quantity` impresa en la línea de la orden (ej. `4.00EA` → `4,00`) |
| Valor unitario | el `PO Price` impreso en la línea (ej. 1.296.000), nunca recalculado a mano |
| Cantidad facturada | **1 por remesa** (un viaje). Regla del dueño 2026-11-11: solo sería 2, 3… si el valor impreso en el medio de la línea (`PO Price`) fuese el doble, el triple… del valor del viaje; en las 3 muestras (CPLTD L8, L12, CMLTD L1) es el valor unitario → **1**. Cálculo general: `PO Price × Quantity ÷ Extended Amt`, debe ser entero ≥ 1; si no, revisión |
| Valor total facturado | cantidad facturada × valor unitario (L12 CPLTD: 1 × 1.296.000 = 1.296.000) |
| Fecha de inicio **y** de terminación de los servicios | la misma: `DATE OF DISPATCH` del Bill of Inland (día/mes/año), confirmado por el dueño 2026-11-11 |
| Sede | fija por tipo (CMLTD/EDLTD/DEIPO → Mina; CPLTD → Puerto), validada contra el encabezado de la orden (**confirmar**) |
| Documentos adjuntos | `<código Bill of Inland> BILL OF INLAND – TRF – ORDEN DE COMPRA <número>` |
| Fecha del acta y cierre en letras («a los N días del mes de MES del año AAAA») | **la misma fecha**: la de creación del acta (hoy, America/Bogota), editable en la revisión (confirmado 2026-11-10 y 2026-11-11); el modelo EDLTD traía «2025», error a corregir |

Descripción de la línea en el acta: **tal cual** como aparece en la orden (confirmado 2026-11-11; incluye vehículo, ruta y tipo de carga; la jurisdicción no se copia por ser un dato aparte en la orden, como en los modelos). Se revisa en la pantalla de revisión.

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
- **I4 Actas**: llenar las 4 plantillas Word con los datos aprobados (aplicando las correcciones de abajo), quitar campos de combinación, convertir a PDF con LibreOffice, fecha en letras y formato numérico; comparar con los modelos.
- **I5 Ensamble**: acta + soporte con `pdf-lib`; nombre de archivo acordado.
- **I6 Aplicación web**: inicio de sesión, carga por Excel/manual, tablero del lote con estados, pantalla de revisión (datos + imagen de la página), descarga individual y por lote (ZIP o un solo PDF).
- **I7 Correo (Microsoft 365)**: Graph `sendMail` con adjuntos; envío individual o por bloques con tope de tamaño por correo (~20 MB; el límite de Exchange ronda 35 MB) y reintentos; registro de envíos. Requiere app de Azure y buzón remitente.
- **I8 Cierre**: límites de intentos, auditoría, manual de uso, pruebas de punta a punta con remesas reales.

## Variables de entorno (sin valores en el repo)
`DATABASE_URL` (+ `DATABASE_SSL`), `SILOG_BASE_URL`, `SOPORTE_SUFIJO`, `TOKEN_SECRET`, `ANTHROPIC_API_KEY`, `IA_MODELO`, credenciales del correo (I7). Ver `.env.example`. Solo en desarrollo local: `ACTAS_MOCK=1` (usa `fixtures/` en vez de Silogtran e IA; ignorado en Vercel). Opcionales: `WAF_CHROME_PATH`, `WAF_WAIT_SEC`, `SILOG_TIMEOUT_SEC`.

## Decisiones de operación (2026-11-11)
- **Cada usuario entra con su propia cuenta de Silogtran**: se valida contra Silogtran al entrar y **la contraseña no se guarda** (solo se guarda el usuario); cada lote/acta/aprobación guarda **qué usuario** la hizo. El soporte se baja de la URL pública, así que no hace falta una sesión de Silogtran por usuario. Tras 5 intentos fallidos en 15 min se bloquea el usuario (protege su cuenta de Silogtran).
- **PLANEADOR y AFE = `N/A` en los 4 tipos** (en el modelo DEIPO el planeador era otra persona; se pasa a N/A por instrucción del dueño).
- **Pendiente, manejado así por ahora; recordárselo al dueño:** (a) sede fija por tipo (CPLTD = Puerto, los demás = Mina); (b) muestras de DEIPO y EDLTD y una poco legible.
- Usuarios: 4–6 personas, cada una con su usuario. Lotes: 100–300 remesas. Correo: Microsoft 365. Nombre del archivo final: `<TIPO>_<remesa>.pdf` (ej. `CPLTD_0101219749.pdf`).
- **Entrega pedida para hoy (2026-11-11):** alcance mínimo viable = descargar soporte → leer → revisión → acta PDF → PDF final descargable por remesa y por lote (I0–I6 simplificados). El correo (I7) puede ir después si no alcanza.

## Estado de implementación (2026-11-11)
Hecho y probado **en local** (MariaDB real + navegador automatizado + datos de ejemplo; `npm test` = 16 pruebas, las de BD corren con `TEST_DATABASE_URL`):
- Base: `db/*.sql` (usuarios, lotes, actas, config por tipo, WAF, intentos de login), `src/db.js`, `src/store/*`, `scripts/migrate.mjs`, `scripts/seed-config.mjs` (carga los datos fijos por tipo desde un JSON local; **nunca** al repo).
- Silogtran: cliente portado de la referencia (`src/silogtran/client.js`, `browser.js`), descarga del soporte por URL pública (`src/soporte/descargar.js`).
- Lectura: `src/lectura/leer.js` (PDF directo a Claude con herramienta de salida fija; dos lecturas en paralelo) + `src/validacion.js` + `src/procesar.js` (estados PENDIENTE→PROCESANDO→LISTA/REVISAR/ERROR; reclamo atómico).
- Acta: `src/actas/html.js` + `pdf.js` (HTML→PDF con Chromium), `datos.js` (formatos y recálculo), `validarEdicion.js`, `final.js` (acta + soporte en un solo PDF con `pdf-lib`; nombre `<TIPO>_<remesa>.pdf`).
- API (4 funciones): `api/health`, `api/auth/[action]`, `api/lotes/[action]`, `api/actas/[action]`. Front: `public/` (login, lotes, lista con estados, revisión en una sola pantalla con soporte a la izquierda y datos / vista previa del acta a la derecha, aprobar individual o por selección, ZIP).
- Flujo probado de punta a punta en local: login → lote → procesar → LISTA/REVISAR/ERROR → revisar → aprobar → PDF final (acta + soporte). Solo se generan PDF de actas aprobadas (409 si no).

**NO verificado todavía (necesita credenciales o despliegue):** acceso real a Silogtran (login y WAF desde Vercel), descarga del soporte desde Vercel, lectura real con Claude (precisión sobre los escaneados), conexión a Hostinger, Chromium en Vercel (tamaño y tiempo del PDF), visor de PDF nativo del navegador en la pantalla de revisión (el navegador automatizado no tiene visor; probar en Chrome/Edge real; si falla, usar PDF.js), ZIP y lectura de Excel (las librerías vienen de cdnjs).
**Falta construir:** acta DEIPO (formato y firmas propios; necesita muestra), correo Microsoft 365 (I7), carga de la configuración por tipo en la BD real, tope de remesas por lote y manual de uso.

## Infraestructura creada (2026-11-11)
- **Hostinger MySQL**: base `u279856486_actas` con usuario propio `u279856486_actasapp` (host `srv2184.hstgr.io:3306`, acceso remoto `%`, asignada al dominio `gestionhotel.techcol-service.cc` solo como metadato). No se tocó ninguna de las otras 4 bases de la cuenta. La clave solo existe como variable sensible en Vercel (no está en el repo).
- **Vercel**: proyecto `agente_actas_drummond` (team `graziany-gd`, `prj_0EexKLn2quLo3rMiViZ5G6wYN2RQ`), ligado a este repo; **la rama de producción es hoy `claude/blissful-cray-f70po1`** (cada push a esa rama despliega a producción). Variables: `DATABASE_URL`, `TOKEN_SECRET`, `ADMIN_KEY` (sensibles), `SILOG_BASE_URL`, `SOPORTE_SUFIJO`, `ACTAS_SEED` (siembra única, ya ejecutada el 2026-11-11 y vaciada a `{}`; se puede borrar). Falta `ANTHROPIC_API_KEY` (la pone el dueño). La protección de Vercel (SSO) está activa para las URL `*.vercel.app`: el equipo no podrá entrar hasta desactivarla o usar un dominio propio.
- El esquema de la BD se crea solo al primer uso (`src/db.js`); la siembra de `ACTAS_SEED` solo corre si `acta_tipos` está vacía. El logo y la firma se suben en `/config.html` (requiere sesión + `ADMIN_KEY`).

## Preguntas abiertas (preguntar al dueño; no asumir)
1. Hostinger: motor y datos de conexión (host, puerto, base, usuario; clave solo como variable de entorno) y acceso remoto habilitado para cualquier origen.
2. Credenciales para correo (app de Azure y buzón remitente), cuando se llegue a I7.
3. Recordatorio pendiente: sede fija por tipo y muestras DEIPO/EDLTD.
