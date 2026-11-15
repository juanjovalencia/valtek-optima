# Valtek Optima: backend y puesta en producción

## Dónde vive cada cosa

| Qué | Dónde | Para qué |
|---|---|---|
| Código | GitHub, repositorio `juanjovalencia/valtek-optima`, rama `juanjo` (la única rama) | Todo lo que se sube a `juanjo` se publica solo |
| Página | GitHub Pages hoy; dominio `valtekoptima.cl` cuando el DNS esté activo | Lo que ve el cliente |
| Datos | **Supabase** para las cuentas reales (cuentas y Valtek Access). La demo pública sigue en el navegador (`localStorage`) | Base de datos, cuentas y archivos |
| Dominio | NIC Chile (registro) + Cloudflare (DNS) | `valtekoptima.cl` y correos `@valtekoptima.cl` |

## Qué cambia con el backend

Hoy la demo guarda todo en el navegador: si dos personas la abren, cada una ve datos distintos y las contraseñas están escritas en el código. Con Supabase:

- **Cuentas reales:** cada persona entra con su correo y contraseña, guardada cifrada.
- **Una sola base de datos:** el guardia, la directora y el contratista ven la misma información, en vivo.
- **Cada cliente aislado:** un colegio nunca ve datos de otro. Lo garantiza la base de datos, no la página (Row Level Security por `org_id`).
- **Archivos privados:** fotos de aseo, documentos de contratistas y carnets en buckets privados (`evidencias`, `documentos`, `acreditaciones`).
- **Bitácora que no se puede alterar:** los accesos solo se agregan; nadie los edita ni los borra.

El esquema está en `supabase/migrations/`.

## Etapas

1. **Base** — hecho: proyecto Supabase `valtek-optima` (región São Paulo), 21 tablas, permisos por rol y buckets privados. Pendiente: dominio `valtekoptima.cl`.
2. **Login real** — hecho: ingresar, crear cuenta, recuperar contraseña y pantalla "Mi cuenta" para administrar instituciones y accesos. La demo pública sigue funcionando aparte, con datos de ejemplo.
3. **Valtek Access** — hecho: personas, empresas contratistas, documentos con vencimiento, puntos de control, validación por RUT, personas dentro ahora y bitácora, todo en la base de datos. Detalle más abajo.
4. **Valtek Clean** — zonas, registros de aseo y fotos.
5. **Eventos** — registro público, aprobación, QR real firmado y correo con el QR (Resend).
6. **Salas** — cerraduras, clases, reservas, asistencia y vehículos. La apertura real depende de integrar el hardware de cada puerta.

Cada etapa se prueba y se publica antes de empezar la siguiente.

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
- **Dominio:** `valtekoptima.cl` está en NIC Chile con los servidores de Cloudflare (`cecelia` y `jakub`), con 4 registros A y un CNAME `www` hacia GitHub Pages, sin proxy. Pendiente: forzar HTTPS en GitHub Pages cuando el certificado esté emitido.
- **Correo propio (Resend):** el correo que trae Supabase solo sirve para pruebas y solo le escribe al dueño del proyecto. Para que los clientes reciban sus correos hay que conectar Resend con el dominio `valtekoptima.cl`.
- **Primer super admin:** se marca en la base de datos después de que el dueño crea su cuenta.

## Reglas

- Las claves privadas de Supabase (`service_role`) y de Resend **nunca** van en el repositorio, que es público. En la página solo va la clave pública (`anon`), que no da acceso a nada sin iniciar sesión.
- Ningún cambio de base de datos se hace a mano: todos quedan como un archivo en `supabase/migrations/`.
