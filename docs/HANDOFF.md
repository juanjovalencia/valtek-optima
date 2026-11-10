# Valtek Optima: Handoff (versión corta)

## Qué es
SaaS para colegios (piloto: Colegio San Nicolás de Myra, Santiago) que une dos módulos:
- **Aseo:** operarias marcan inicio/fin de cada zona desde el celular; la dirección ve tiempos, diagnósticos y reportes.
- **Acceso:** contratistas con documentos, eventos con link de registro, QR por RUT, portería en 2 etapas (P1 puerta → P2 torniquete).

## Roles (`user.role`)
| Rol | Ve |
|---|---|
| `superadmin` (juanjo) | Todo: colegios, usuarios, aprobación de contratistas, métricas, bitácora |
| `admin` (Directora) | Panel completo + Eventos + Aprobaciones + Bitácora |
| `jefe` (Jefe de Aseo) | Personal, Asignación, Monitoreo, Informes (sin eventos/aprobaciones) |
| `trabajador` | Vista celular con sus zonas asignadas |
| `proveedor` | Alta de trabajadores externos y carga de 6 documentos |
| `porteria` | Búsqueda por RUT, registro entrada/salida, escaneo QR de eventos |

## Stack actual (todo es frontend)
- **Un solo archivo**: `valtek-optima/index.html` (~6.350 líneas: CSS inline + HTML + JS vanilla).
- Sin framework, sin backend, sin base de datos. Persistencia en `localStorage` (claves `vo_*`, `DATA_VERSION = '5.1'`; si cambia la versión se borran los datos).
- Fuentes: Google Fonts (Outfit, Inter). Sin librerías externas.
- Deploy: GitHub Actions → GitHub Pages desde la rama `juanjo`, carpeta `./valtek-optima`.
- Archivos en la raíz (`index.html`, `app.js`, `style.css`, `temp_js.js`): **prototipo antiguo, no se usa**.
- Regla del repo: **todo commit va a la rama `juanjo`, nunca a `main`.**

## Modelo de datos (objeto `state`)
- `schools` {id, name, city, plan}
- `users` {id, name, email, password (texto plano), role, schoolId}
- `zones` (51) {id, name, type sala|cancha|bano|camarin, floor, status pendiente|en-proceso|limpio, assignedTo, entradaTime, salidaTime, diagnostic}
- `auditLog` {zid, workerId, entradaTime, salidaTime, diagnostic excelente|regular|malo, photoBefore/After (base64), comment, status}
- `externalWorkers` {id, rut, type aseo|mantencion, providerId, status, forcedAuthorization, documents{cedula, antecedentes, inhabilidades, psicologico, licencia, das}: {files[], expiryDate}}
- `gateLog` {externalWorkerId, rut, type entrada|salida, timestamp, registeredBy}
- `eventos` {id, nombre, fecha, horaInicio, horaFin, puertasAutorizadas[], encargadoId, schoolId}
- `invitadosAcceso` {id, eventoId, rut, nombreCompleto, email, fotos carnet/selfie, estadoAprobacion, qrToken, scanP1, scanP2, ingresoMarcado, horaIngreso}

## Reglas de negocio clave
- Una operaria solo puede tener **una zona en proceso** a la vez (`startZone`).
- Contratista: autorizado solo si sus 6 documentos están cargados y vigentes; si no, la autorización queda como `autorizado-forzado` con advertencia legal.
- Registro a evento: exige consentimiento, RUT, nombre, email y 3 fotos; no se permite el mismo RUT dos veces en un evento; `qrToken` = RUT normalizado.
- Validación QR (`apiPorteriaValidarQr`): registro aprobado + evento hoy + ventana de horario (desde 30 min antes); P2 exige haber pasado P1.
- Purga de datos de visitantes >30 días (Ley 19.628).

## Lo que funciona
Login por rol, aseo completo con fotos y comentarios, reportes PDF (`window.print`), contratistas y documentos, portería por RUT, eventos con link `#enrol-{id}`, aprobación de visitantes, simulación P1/P2 y demo animada.

## Problemas conocidos
- **No hay correo real**: `aprobarInvitado` solo muestra un toast.
- **El QR es falso**: `generateQrCodeGrid` dibuja un patrón decorativo que no se puede escanear y además nunca se llama.
- Las fotos del registro son simuladas (SVG de ejemplo); la subida de archivos real no existe en ese flujo.
- Contraseñas en texto plano en el código; superadmin fijo `juanjo`/`123`. La seguridad por rol solo oculta botones.
- `localStorage` tiene un límite de ~5 MB, que se llena con las fotos en base64.
- "Hoy" se calcula con `toISOString()` (UTC): después de las 21:00 en Chile la fecha cambia de día.
- `puertasAutorizadas` no se valida; no se registra la salida en eventos.
- Los eventos **no tienen estado de aprobación** de la directora.
- Portería busca al personal interno por **nombre**, no por RUT.
- La purga no borra el email ni las fotos.

## Siguiente paso
Pasar a backend + base de datos multi-cliente, con QR firmado, correo real y dominio .cl (ver `implementation_plan.md`).
