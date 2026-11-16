# Valtek Optima: backend y puesta en producción

## Dónde vive cada cosa

| Qué | Dónde | Para qué |
|---|---|---|
| Código | GitHub, repositorio `juanjovalencia/valtek-optima`, rama `juanjo` (la única rama) | Todo lo que se sube a `juanjo` se publica solo |
| Página | GitHub Pages, con el dominio propio `valtekoptima.cl` y https forzado. Lo que se publica es la carpeta `valtek-optima/` | Lo que ve el cliente |
| Datos | **Supabase** para las cuentas reales (cuentas y Valtek Access). La demo pública sigue en el navegador (`localStorage`) | Base de datos, cuentas y archivos |
| Dominio | NIC Chile (registro) + Cloudflare (DNS) | `valtekoptima.cl` y correos `@valtekoptima.cl` |
| Correos | Todavía sin configurar: ver "Correos del dominio" más abajo | Recibir en `contacto@valtekoptima.cl` y enviar los correos de la plataforma |

## Qué cambia con el backend

Hoy la demo guarda todo en el navegador: si dos personas la abren, cada una ve datos distintos y las contraseñas están escritas en el código. Con Supabase:

- **Cuentas reales:** cada persona entra con su correo y contraseña, guardada cifrada.
- **Una sola base de datos:** el guardia, la directora y el contratista ven la misma información, en vivo.
- **Cada cliente aislado:** un colegio nunca ve datos de otro. Lo garantiza la base de datos, no la página (Row Level Security por `org_id`).
- **Archivos privados:** fotos de aseo, documentos de contratistas y carnets en buckets privados (`evidencias`, `documentos`, `acreditaciones`).
- **Bitácora que no se puede alterar:** los accesos solo se agregan; nadie los edita ni los borra.

El esquema está en `supabase/migrations/`.

## Etapas

1. **Base** — hecho: proyecto Supabase `valtek-optima` (región São Paulo), 21 tablas, permisos por rol y buckets privados. Dominio `valtekoptima.cl` activo con https.
2. **Login real** — hecho: ingresar, crear cuenta, recuperar contraseña y pantalla "Mi cuenta" para administrar instituciones y accesos. La demo pública sigue funcionando aparte, con datos de ejemplo.
3. **Valtek Access** — hecho: personas, empresas contratistas, documentos con vencimiento, puntos de control, validación por RUT, personas dentro ahora y bitácora, todo en la base de datos. Detalle más abajo.
4. **Valtek Clean** — zonas, registros de aseo y fotos.
5. **Eventos** — registro público, aprobación, QR real firmado y correo con el QR (Resend).
6. **Salas** — cerraduras, clases, reservas, asistencia y vehículos. La apertura real depende de integrar el hardware de cada puerta.

Cada etapa se prueba y se publica antes de empezar la siguiente. Lo que viene después de estas etapas (control de alumnos y credencial única por tarjeta o huella) está en `docs/ROADMAP.md`.

## Valtek Access con datos reales (etapa 3)

Una cuenta real ve Valtek Access en el menú según su rol en la **institución activa** (si pertenece a varias, la elige en "Mi cuenta" con "Trabajar aquí"):

| Rol en la institución | Qué ve |
|---|---|
| Administración, Jefatura de seguridad | Panel, control de acceso, personas dentro, registro de personas, empresas contratistas, puntos de control y bitácora |
| Guardia, Portería | Solo control de acceso, personas dentro y bitácora. No puede crear ni editar nada |
| Otros roles | Solo "Mi cuenta" |

Cómo funciona:

- **La base de datos decide quién pasa.** La página no calcula el resultado: llama a la función `access_validate`, que revisa las reglas (credencial activa, empresa contratista al día, período autorizado, inducción, documentos vigentes, zona autorizada, certificación del punto y secuencia de acceso), guarda el intento en la bitácora y actualiza quién está dentro, todo en un solo paso. Son las mismas reglas de la demo.
- **La bitácora no se puede falsear.** Los accesos solo entran a través de esa función. Nadie puede escribir, editar ni borrar un registro a mano, ni siquiera la administración. Cada registro guarda una copia del nombre del punto, de la empresa y de quien lo registró.
- **Personas dentro ahora** (`access_presence`): solo la escribe la base de datos al validar una entrada o una salida.
- **Documentos exigidos por institución** (`doc_types`): cada institución nueva nace con un catálogo según su tipo. Colegios, universidades e institutos: cédula, antecedentes, inhabilidades para trabajar con menores y, para contratistas, idoneidad psicológica, licencia y DAS. Industria y demás: cédula, contrato, examen pre-ocupacional, inducción, mutualidad y EPP. Todas: F30, F30-1, mutualidad y contrato de servicios para cada empresa contratista. El catálogo se puede ajustar por institución directamente en esa tabla (todavía no hay pantalla para eso).
- **Documentos con vencimiento:** administración y seguridad anotan la fecha de cada documento (o "No vence"). Vale siempre el último registro; el historial queda guardado.
- **Puntos de control** (`gates`): cada institución crea los suyos. Un punto sin "punto anterior" es una entrada al recinto; un punto con zona solo deja pasar a quien tenga esa zona autorizada.
- **Importar nómina:** archivo CSV con las columnas `nombre;rut;empresa;cargo`. Crea las empresas que falten y agrega solo los RUT que no existían.

Código: `assets/access-data.js` (lectura y escritura en Supabase) y `assets/access.js` (pantallas, las mismas de la demo). Base de datos: `supabase/migrations/20261115034830_valtek_access.sql`.

Todavía no incluye: subir el archivo escaneado de cada documento (hoy se anota solo la fecha), el portal para que la empresa contratista cargue sus propios documentos, y una pantalla para editar el catálogo de documentos exigidos.

## Pendientes de configuración en Supabase

- **Authentication → URL Configuration:** `valtekoptima.cl` ya está en la lista de direcciones permitidas. Pendiente: cambiar el *Site URL* a `https://valtekoptima.cl` (hoy apunta a la dirección antigua de github.io, que redirige al dominio).
- **Dominio:** `valtekoptima.cl` está activo en NIC Chile con los servidores de Cloudflare (`cecelia` y `jakub`), con 4 registros A y un CNAME `www` hacia GitHub Pages y **HTTPS forzado activo** (certificado Let's Encrypt emitido para `valtekoptima.cl` y `www.valtekoptima.cl`).
- **Correo propio (Resend):** el correo que trae Supabase solo sirve para pruebas y solo le escribe al dueño del proyecto. Para que los clientes reciban sus correos hay que conectar Resend con el dominio `valtekoptima.cl`: pasos en "Correos del dominio".
- **Primer super admin:** se marca en la base de datos después de que el dueño crea su cuenta.

## Sitio público

Lo que ve una persona que llega a `https://valtekoptima.cl` sin cuenta. Todo vive en `valtek-optima/`:

| Archivo | Para qué |
|---|---|
| `index.html` | Página principal: presentación, demostración, contacto e ingreso de clientes. También contiene las pantallas de la plataforma |
| `privacidad.html` y `terminos.html` | Política de privacidad (Ley 19.628 y Ley 21.719) y términos de uso. Enlazadas desde el pie, la ventana de ingreso y el registro de visitantes a eventos |
| `404.html` | Página propia para direcciones que no existen. GitHub Pages la usa sola. Sus rutas parten con `/` porque se muestra desde cualquier dirección |
| `robots.txt` y `sitemap.xml` | Le dicen a Google qué páginas existen. La copia de respaldo de la demo (`public/`) queda fuera de los buscadores |
| `site.webmanifest`, `favicon.ico` y `assets/img/` | Ícono de la pestaña, íconos al guardar la página en el celular e imagen que aparece al compartir el enlace (`og.jpg`, 1200 × 630) |

Cosas que hay que mantener al día a mano:

- **Datos de contacto.** El correo `contacto@valtekoptima.cl` está escrito en `index.html` (sección Contacto, pie y datos para buscadores), `privacidad.html`, `terminos.html` y el aviso para navegadores sin JavaScript. Si cambia, o cuando se agregue un teléfono o WhatsApp, buscar esa dirección en `valtek-optima/` y cambiarla en todos.
- **Razón social y RUT de la empresa.** Las páginas legales hoy dicen "Valtek Optima, con domicilio en Santiago de Chile". Falta agregar la razón social y el RUT en la sección 1 de `privacidad.html` y de `terminos.html` cuando el dueño los entregue.
- **Fecha de las páginas legales.** Al cambiar su texto, actualizar "Última actualización" en la página y `lastmod` en `sitemap.xml`.
- **Lista de proveedores.** La sección 7 de `privacidad.html` nombra a Supabase, GitHub, Cloudflare, Google Fonts y jsDelivr. Si se cambia el alojamiento o se suma un proveedor (por ejemplo Resend para los correos), hay que actualizarla.
- **Promesas que la plataforma debe cumplir.** La política dice que los datos de visitantes a eventos se eliminan 30 días después del evento y que no se hace reconocimiento facial. La etapa 5 (Eventos) tiene que programar ese borrado en la base de datos; hoy solo existe en la demostración.
- **Versión de los archivos.** `index.html` carga `valtek.css?v=…` y `shell.js?v=…`. Al cambiar uno de esos archivos hay que subir el número para que los navegadores no usen la copia antigua. Las páginas legales y `404.html` también cargan `valtek.css?v=…`.
- **Imagen al compartir.** WhatsApp y LinkedIn guardan la vista previa por varios días. Si se cambia `og.jpg`, conviene cambiarle también el nombre para que la vuelvan a leer.

Los textos legales fueron redactados sin asesoría jurídica: **conviene que un abogado los revise** antes de firmar con clientes, sobre todo por la Ley 21.719, que exige más que la anterior.

Las cuentas de demostración ya no aparecen con su correo en la ventana de ingreso: la demostración se abre desde la sección "Míralo funcionando". El perfil "Super admin" se quitó de la página pública (es la vista interna de Valtek); sigue entrando al escribir su usuario y clave en "Ingresar".

## Dónde se aloja la página

**Recomendación: seguir en GitHub Pages por ahora.** Funciona, es gratis, ya tiene el dominio propio con https forzado y cada cambio que se sube a `juanjo` se publica solo en uno o dos minutos. Cambiar hoy no le daría nada nuevo a quien visita la página.

Lo que GitHub Pages no permite, y por qué algún día importará:

- **Cabeceras de seguridad propias.** Son instrucciones que el servidor le da al navegador (por ejemplo, "esta página no se puede mostrar dentro de otra"). El área de informática de un cliente grande puede pedirlas en una revisión.
- **Redirecciones y reglas de caché propias.**
- **Una copia de prueba por cada cambio**, para revisar antes de publicar.
- **Repositorio privado.** En el plan gratis de GitHub, Pages exige que el código sea público.
- **Uso comercial.** Las condiciones de GitHub Pages dicen que no está pensado como alojamiento gratuito para operar un negocio o un servicio de software. Para una página de presentación y un piloto no ha sido problema, pero es un motivo para cambiar antes de tener clientes de pago (conviene releer esas condiciones en ese momento).

**Cuando haga falta alguna de esas cosas, la salida es Cloudflare Pages**: es gratis, permite uso comercial, admite cabeceras y redirecciones, crea copias de prueba y funciona con repositorio privado. Además el DNS del dominio ya está en Cloudflare, así que el certificado https sale en minutos. **Vercel quedó descartado** por el dueño: su plan gratis no permite uso comercial y no ofrece nada que Cloudflare Pages no tenga.

Cómo sería el cambio (unos 20 minutos, con la cuenta de Cloudflare del dueño; no hacerlo sin su aprobación):

1. En Cloudflare, crear un proyecto de Pages conectado al repositorio de GitHub: rama `juanjo`, sin comando de compilación, carpeta de salida `valtek-optima`.
2. Probar la dirección `*.pages.dev` que entrega Cloudflare.
3. Agregar `valtekoptima.cl` y `www.valtekoptima.cl` como dominios del proyecto. Cloudflare ajusta los registros DNS.
4. Quitar el dominio en GitHub Pages y desactivar `.github/workflows/deploy.yml`.
5. Crear `valtek-optima/_headers` con las cabeceras de seguridad (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` y `Strict-Transport-Security`).
6. Actualizar la lista de proveedores de `privacidad.html` (GitHub deja de alojar la página).

En Supabase no cambia nada, porque la dirección de la página sigue siendo la misma.

Mientras la página siga en GitHub Pages, **no activar el proxy de Cloudflare** (la nube naranja) en los registros del dominio: GitHub necesita llegar directo para renovar el certificado.

## Correos del dominio

Hoy `valtekoptima.cl` **no recibe ni envía correos** (no tiene registros de correo en el DNS). La página ya muestra `contacto@valtekoptima.cl`, así que el paso 1 es urgente: hasta hacerlo, lo que alguien escriba a esa dirección rebota.

Hay tres necesidades distintas y cada una se resuelve con algo diferente:

| Necesidad | Con qué | Costo |
|---|---|---|
| **Recibir** lo que escriben a `contacto@valtekoptima.cl` | Cloudflare Email Routing: reenvía cada mensaje al correo personal del dueño. Solo recibe y reenvía, no envía | Gratis |
| **Enviar** los correos de la plataforma: confirmar una cuenta, recuperar la contraseña y, en la etapa de Eventos, el QR de acreditación | Resend con el dominio `valtekoptima.cl`, conectado al correo de Supabase Auth | Gratis para partir (el plan sin costo tiene un tope diario y mensual; revisarlo en resend.com) |
| **Casillas de verdad** (bandeja propia, varias personas, calendario) | Un proveedor de correo, como Google Workspace o Zoho Mail | De pago por casilla |

### Paso 1 · Recibir en `contacto@valtekoptima.cl` (lo hace el dueño, 5 minutos)

1. Entrar a Cloudflare, elegir el dominio `valtekoptima.cl` y abrir **Email → Email Routing**.
2. Activarlo. Cloudflare agrega solo los registros que hacen falta (tres `MX` y un `TXT`).
3. Crear la dirección `contacto@valtekoptima.cl` y poner como destino el correo personal donde se quiere recibir.
4. Abrir el mensaje de verificación que llega a ese correo personal y confirmar.
5. Probar: escribir a `contacto@valtekoptima.cl` desde otro correo y ver que llega.

Esto no toca los registros de la página (los `A` y el `CNAME www` no se modifican).

### Paso 2 · Enviar los correos de la plataforma con Resend (lo hace el dueño, 20 minutos)

Sin este paso, Supabase solo le envía correos al dueño del proyecto: un cliente que crea su cuenta o pide recuperar su contraseña no recibe nada.

1. Crear una cuenta en resend.com.
2. En **Domains**, agregar `valtekoptima.cl`. Si ofrece elegir región, usar São Paulo.
3. Resend muestra los registros DNS que necesita (un `MX` y dos `TXT`, sobre los nombres `send` y `resend._domainkey`). Copiarlos tal cual en Cloudflare → DNS, en modo "DNS only". No chocan con los del paso 1, porque usan otro nombre.
4. Agregar además un registro `TXT` con nombre `_dmarc` y valor `v=DMARC1; p=none; rua=mailto:contacto@valtekoptima.cl`. Ayuda a que los correos no caigan en spam.
5. Esperar a que Resend marque el dominio como verificado y crear una clave en **API Keys**, con permiso solo para enviar.
6. En Supabase, proyecto `valtek-optima`, abrir **Authentication → Emails → SMTP Settings**, activar el SMTP propio y completar: servidor `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = la clave de Resend, remitente `no-responder@valtekoptima.cl`, nombre `Valtek Optima`. (Resend tiene también una integración con Supabase que completa estos datos sola.)
7. En **Authentication → URL Configuration**, cambiar el *Site URL* a `https://valtekoptima.cl`.
8. En **Authentication → Emails → Templates**, pegar los textos en español de `docs/CORREOS.md`. Sin esto, los correos salen en inglés.
9. Probar: en la página, "Ingresar" → "Olvidé mi contraseña" con un correo que no sea el del dueño.

**La clave de Resend se pega directo en Supabase. Nunca va en el repositorio, en la página ni en un chat.** Para la etapa de Eventos (correo con el QR) se guardará como secreto de la función en Supabase, tampoco en el código.

Cuando Resend quede conectado, agregarlo a la lista de proveedores de `privacidad.html`.

### Más adelante · Responder como `contacto@` y casillas propias

- **Responder desde Gmail como `contacto@valtekoptima.cl`:** con el paso 2 hecho, se puede agregar esa dirección en Gmail ("Enviar correo como") usando el mismo servidor de Resend. Así se recibe y se responde con la dirección de la empresa sin pagar casillas.
- **Casillas de verdad:** cuando haya más personas atendiendo clientes. Al contratar el proveedor hay que **desactivar Email Routing**, porque un dominio no puede recibir en dos servicios a la vez; los registros de Resend se mantienen.

## Reglas

- Las claves privadas de Supabase (`service_role`) y de Resend **nunca** van en el repositorio, que es público. En la página solo va la clave pública (`anon`), que no da acceso a nada sin iniciar sesión.
- Ningún cambio de base de datos se hace a mano: todos quedan como un archivo en `supabase/migrations/`.
