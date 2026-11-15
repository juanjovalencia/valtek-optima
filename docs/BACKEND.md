# Valtek Optima: backend y puesta en producción

## Dónde vive cada cosa

| Qué | Dónde | Para qué |
|---|---|---|
| Código | GitHub, repositorio `juanjovalencia/valtek-optima`, rama `juanjo` (la única rama) | Todo lo que se sube a `juanjo` se publica solo |
| Página | GitHub Pages hoy; dominio `valtekoptima.cl` cuando el DNS esté activo | Lo que ve el cliente |
| Datos | Hoy en el navegador de cada persona (`localStorage`). Pasan a **Supabase** | Base de datos, cuentas y archivos |
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
3. **Valtek Access** — personas, empresas contratistas, documentos, puntos de control y bitácora en la base de datos.
4. **Valtek Clean** — zonas, registros de aseo y fotos.
5. **Eventos** — registro público, aprobación, QR real firmado y correo con el QR (Resend).
6. **Salas** — cerraduras, clases, reservas, asistencia y vehículos. La apertura real depende de integrar el hardware de cada puerta.

Cada etapa se prueba y se publica antes de empezar la siguiente.

## Pendientes de configuración en Supabase

- **Authentication → URL Configuration:** hecho. El *Site URL* apunta a `https://juanjovalencia.github.io/valtek-optima/` y `valtekoptima.cl` ya está en la lista de direcciones permitidas. Cuando el dominio esté activo, hay que cambiar el *Site URL* a `https://valtekoptima.cl`.
- **Correo propio (Resend):** el correo que trae Supabase solo sirve para pruebas y solo le escribe al dueño del proyecto. Para que los clientes reciban sus correos hay que conectar Resend con el dominio `valtekoptima.cl`.
- **Primer super admin:** se marca en la base de datos después de que el dueño crea su cuenta.

## Reglas

- Las claves privadas de Supabase (`service_role`) y de Resend **nunca** van en el repositorio, que es público. En la página solo va la clave pública (`anon`), que no da acceso a nada sin iniciar sesión.
- Ningún cambio de base de datos se hace a mano: todos quedan como un archivo en `supabase/migrations/`.
