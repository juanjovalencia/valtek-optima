# Hoja de ruta de Valtek Optima

Estado al 16 de noviembre de 2026. Aquí está **lo que viene**. Lo que ya está hecho y cómo funciona por dentro está en `docs/BACKEND.md`.

Regla de siempre: cada etapa se prueba y se publica antes de empezar la siguiente.

## En curso: llevar cada módulo a datos reales

Las cuentas reales y Valtek Access ya trabajan con la base de datos. Faltan tres módulos, que hoy solo se ven en la demostración:

| Etapa | Qué incluye | Ojo con |
|---|---|---|
| 4 · Valtek Clean | Zonas, asignación del día, registros de aseo y fotos del antes y el después | Las fotos van a un almacenamiento privado, no a la base de datos |
| 5 · Eventos | Registro público de visitantes, aprobación, QR real firmado y correo con el QR | Necesita Resend conectado (`docs/BACKEND.md`, "Correos del dominio"). Debe programar el **borrado a los 30 días** que promete la política de privacidad |
| 6 · Salas | Cerraduras, clases, reservas, asistencia y vehículos | La apertura real depende del equipo instalado en cada puerta |

## Etapa 7 · Control de alumnos

**Qué pidió el dueño:** que colegios y universidades puedan controlar a sus alumnos, no solo a trabajadores, contratistas y visitas.

**Qué resolvería:**

- Saber qué alumnos entraron y salieron del recinto, y a qué hora.
- Asistencia por sala sin pasar lista, cuando el alumno marca al entrar.
- En colegios: retiro de alumnos solo por las personas que el apoderado autorizó, con registro de quién retiró a quién.
- Aviso al apoderado cuando el alumno entra, sale o no llegó.
- Lista de quién está dentro ante una emergencia, incluyendo alumnos.

**Qué ya existe y sirve:**

- La tabla de personas (`people`) ya admite los tipos `estudiante`, `docente` y `funcionario`.
- La validación en la entrada (`access_validate`), la bitácora y "personas dentro ahora" funcionan igual para cualquier tipo de persona.
- La asistencia por clase (`attendance`) ya está en el esquema, para la etapa de Salas.

**Qué falta construir:**

- Curso o carrera de cada alumno, y carga masiva de la nómina desde un archivo.
- Apoderados y personas autorizadas a retirar, con su relación con cada alumno.
- Pantalla de retiro para portería.
- Avisos al apoderado por correo (WhatsApp o SMS tienen costo por mensaje).
- Reglas distintas a las de un contratista: a un alumno no se le piden documentos, pero sí horario, sede y autorizaciones.

**Lo delicado: son datos de menores de edad.** La ley chilena les da protección especial. Antes de construir hay que definir con un abogado: qué autoriza el apoderado y cómo queda registrado, qué ve cada rol del colegio, cuánto tiempo se guarda el historial de un alumno y qué pasa cuando egresa o se retira. La recomendación es partir con un colegio piloto y los datos mínimos (nombre, RUT, curso y credencial).

## Etapa 8 · Credencial única: tarjeta, huella o QR para "entrar a todas partes"

**Qué pidió el dueño:** que cada persona tenga una credencial con la que pueda entrar a todos los lugares donde está autorizada (portería, torniquete, salas, estacionamiento), en industria, colegios y universidades.

**La idea:** una sola persona, varias formas de identificarse, las mismas reglas. Da lo mismo si acerca una tarjeta, muestra un QR o pone el dedo: el sistema reconoce quién es y aplica lo que ya sabe de ella (si está activa, si su empresa está al día, si tiene permiso para esa zona, si está dentro de su horario).

**Qué ya existe y sirve:**

- La tabla de credenciales (`credentials`) ya admite tres tipos: `qr`, `tarjeta` y `patente`. Cada credencial pertenece a una persona, tiene vigencia y se puede revocar. El código nunca se guarda tal cual, solo una versión cifrada.
- Los puntos de control (`gates`) ya distinguen garita, torniquete, zona, puerta y barrera.
- Las reglas de acceso viven en la base de datos, así que sirven para cualquier lector.

**Qué falta construir, por tipo de credencial:**

| Credencial | Qué falta | Dificultad |
|---|---|---|
| **QR** | Generar el QR firmado y leerlo con la cámara del celular o con un lector fijo. Se construye en la etapa 5 | Baja |
| **Tarjeta** (de proximidad) | Pantalla para asociar el número de la tarjeta a la persona y conexión con los lectores de cada puerta | Media: depende del lector |
| **Patente** | Conexión con la cámara que lee patentes en la barrera. Se construye en la etapa 6 | Media: depende de la cámara |
| **Huella** | Un tipo nuevo de credencial en la base de datos (`huella`) y conexión con los lectores biométricos | Alta |

**Lo que hay que saber sobre la huella:**

- **La huella no se guarda en Valtek.** Lo correcto es que el lector guarde el patrón de la huella y le entregue a Valtek solo un número que identifica a la persona. Así, si alguien entrara a la base de datos, no encontraría huellas.
- **Es un dato sensible para la ley.** La Ley 21.719 trata los datos biométricos con las exigencias más altas: consentimiento expreso, explicar para qué se usa y ofrecer siempre otra forma de entrar (tarjeta o QR) a quien no quiera registrar su huella.
- **En menores de edad no se recomienda.** Para alumnos de colegio conviene tarjeta o QR.
- **Hay que actualizar la política de privacidad** antes de activarla: hoy dice que no se crean registros biométricos.

**La parte que no es programación: los lectores.** Cada puerta necesita un equipo que lea la credencial y abra. Hay dos caminos y conviene decidirlo con el primer cliente que lo pida:

1. **Usar los equipos que el cliente ya tiene** (por ejemplo, torniquetes y lectores ZKTeco): Valtek se conecta a su controlador. Es más barato para el cliente, pero cada marca se integra distinto.
2. **Definir un equipo recomendado por Valtek** y ofrecerlo instalado. Es más simple de mantener, pero exige inversión y un instalador.

En los dos casos hace falta una pieza intermedia: un programa pequeño, instalado en la red del recinto, que conversa con los lectores y con Valtek. Sirve además para que las puertas sigan abriendo si se corta internet, con la última lista de personas autorizadas.

**Orden sugerido:** QR (etapa 5) → tarjeta con un solo modelo de lector en un cliente piloto → patente (etapa 6) → huella, solo si un cliente la exige y con revisión legal previa.

## Mejoras menores del sitio público

No bloquean nada; se pueden hacer entre etapas:

- **Formulario de contacto que guarde en la base de datos**, además del correo. Necesita una tabla nueva.
- **Botón de WhatsApp** en la sección de contacto, cuando haya un número de empresa.
- **Tipografías alojadas en el propio sitio**: hoy se cargan desde Google Fonts. Tenerlas propias hace la página un poco más rápida y evita depender de un tercero.
- **Cabeceras de seguridad**, al pasar a Cloudflare Pages (`docs/BACKEND.md`, "Dónde se aloja la página").
- **Separar el programa que hoy va dentro de `index.html`** en archivos. Permite reglas de seguridad más estrictas y es parte del paso a Vite que prevé `CLAUDE.md`.
