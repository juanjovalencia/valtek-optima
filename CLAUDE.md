# CLAUDE.md — Guía y Contexto del Proyecto Valtek Optima

## 🚨 REGLA OBLIGATORIA DEL REPOSITORIO
1. **Siempre que escribas código y hagas algún cambio, debes subirlo al repositorio de GitHub en la rama `juanjo`, NUNCA en la rama `main`.**
   ```bash
   git checkout juanjo
   git add .
   git commit -m "descripción del cambio"
   git push origin juanjo
   ```

---

## 1. Visión General del Producto
**Valtek Optima** es una plataforma SaaS B2B (inicialmente piloteada en el **Colegio San Nicolás de Myra**, Santiago de Chile) que unifica dos operaciones críticas en instituciones educativas, universidades y centros comerciales (malls):
1. **Control y Auditoría de Aseo en Tiempo Real:** Operarias marcan inicio, diagnóstico inicial con emoji (`excelente` / `regular` / `malo`), foto del antes/después, comentario y término en cada una de las zonas asignadas desde su celular. Dirección y Jefatura ven métricas en vivo, tiempos por sala y reportes imprimibles en PDF.
2. **Control de Acceso y Seguridad (Portería + Eventos + Contratistas):**
   - **Contratistas / Personal Externo:** Empresas proveedoras suben 6 documentos obligatorios (Cédula, Antecedentes, Inhabilidades para trabajar con menores, Idoneidad Psicológica, Licencia/Certificación, DAS) con fechas de vencimiento. Portería consulta por RUT y ve bloqueo automático o autorización.
   - **Eventos y Pre-Acreditación QR:** Creación de eventos con link público (`#enrol-{eventoId}`), formulario de registro con RUT chileno, fotos de carnet (frontal/trasero) y selfie, consentimiento Ley 19.628, aprobación por la administración, envío de QR basado en el RUT al correo y validación en portería en 2 etapas: **P1 (Puerta Exterior)** y **P2 (Torniquete Bidireccional ZKTeco)**.

---

## 2. Estructura Actual del Repositorio
- `valtek-optima/index.html`: Aplicación principal actual (prototipo funcional con HTML + JS vanilla y persistencia en `localStorage` bajo claves `vo_*`, versión `DATA_VERSION = '6.0'`).
- `valtek-optima/assets/valtek.css`: Sistema de diseño v6 (minimalista, oscuro) que reemplaza el CSS inline.
- `valtek-optima/assets/shell.js`: Navegación por módulos (menú lateral + topbar), rutas por rol, Centro de control, sesión persistente y landing. Los módulos son **Aseo y Personal** (Optima Clean) y **Seguridad y Acceso** (Optima Access).
- `docs/PITCH.md`: Planteamiento comercial, speech y guion de demo.
- Probar en local: `python3 -m http.server 5173 --directory valtek-optima` (o la configuración `valtek-optima` de `.claude/launch.json`).
- `valtek-optima/public/demo/index.html`: Copia de respaldo intacta del demo interactivo.
- `valtek-optima/package.json`, `vite.config.js`, `.env.example`: Base inicial para la migración a **Vite + Supabase (PostgreSQL + Auth + Storage + Edge Functions)**.
- Archivos en la raíz (`index.html`, `app.js`, `style.css`, `temp_js.js`): Prototipo antiguo legado (no modificar; el desarrollo activo está en `valtek-optima/`).

---

## 3. Roles y Credenciales de Prueba (Prototipo Actual)
| Rol | Usuario / Email | Contraseña | Permisos Principales |
|---|---|---|---|
| `superadmin` | `juanjo` o `juanjo@valtek.cl` | `123` | Acceso total multi-colegio, creación de clientes/usuarios, aprobación de contratistas, métricas globales y bitácora |
| `admin` (Directora) | `admin@valtek.cl` | `1234` | Panel Directora completo: Personal, Asignación, Monitoreo, Informes, Aprobación Contratistas, Bitácora y Eventos Finde |
| `jefe` (Jefe de Aseo) | `jefe@valtek.cl` | `1234` | Personal, Asignación de las 51 zonas, Monitoreo en vivo e Informes |
| `trabajador` | `maria@valtek.cl`, `carmen@valtek.cl`, `rosa@valtek.cl`, `patricia@valtek.cl` | `1234` | Emulador móvil de operaria (restringido a 1 zona `en-proceso` a la vez) |
| `proveedor` | `proveedor@valtek.cl` | `1234` | Registro de trabajadores externos y carga de los 6 documentos legales |
| `porteria` | `porteria@valtek.cl` | `1234` | Control de acceso por RUT (contratistas/planta) y validación QR P1/P2 de eventos |

---

## 4. Hoja de Ruta Arquitectónica (Migración SaaS Multi-Cliente)
El objetivo actual es evolucionar `valtek-optima` a una arquitectura **Full-Stack Multi-Tenant**:
1. **Base de Datos y Backend (Supabase PostgreSQL + RLS):**
   - Tablas aisladas por `org_id`: `organizations` (`colegio`, `universidad`, `mall`, `empresa`), `org_modules` (`aseo`, `acceso`, `contratistas`, `eventos`), `sites`, `profiles`, `memberships`, `zones`, `cleaning_logs`, `people`, `contractor_documents`, `events`, `event_registrations`, `credentials`, `gates`, `access_logs`.
   - Autenticación real con Supabase Auth (contraseñas con bcrypt, sesiones JWT).
   - Almacenamiento de archivos pesados y evidencias en **Supabase Storage** (buckets privados `evidencias`, `documentos`, `acreditaciones`).
2. **Módulo QR Seguro basado en RUT + Envío de Correo Real:**
   - Reemplazar el QR decorativo actual por un QR real escaneable generado con la librería `qrcode` y firmado criptográficamente (`VO1.<payload>.<firma>`), vinculado al RUT chileno validado (Módulo 11).
   - Envío real de correos transaccionales con el QR adjunto al aprobar al visitante (vía **Resend** / Edge Function).
   - Escaneo real con cámara desde cualquier celular en portería (`html5-qrcode`).
3. **Despliegue en Dominio `.cl`:**
   - Hosting frontend en Cloudflare Pages conectado al dominio `.cl` (NIC Chile) y backend en Supabase.
