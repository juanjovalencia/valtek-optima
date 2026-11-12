# Valtek Optima: planteamiento comercial

## 1. Qué vendemos

**Valtek Optima** es una plataforma que une el **aseo** y la **seguridad** de un recinto en un solo centro de control. Se vende en dos módulos que funcionan por separado o juntos:

| | **Valtek Clean**: Aseo y Personal | **Valtek Access**: Seguridad y Acceso |
|---|---|---|
| Qué resuelve | ¿Se limpió de verdad? ¿Quién lo hizo y cuánto demoró? | ¿Quién está dentro del recinto? ¿El contratista está habilitado? |
| Funciones | Asignación de zonas · App móvil para operarios (diagnóstico + foto antes/después) · Monitor en vivo · Informes PDF y rankings | Contratistas con 6 documentos y vencimientos · Portería por RUT · Eventos con link de registro y acreditación · Acceso automatizado con QR en puerta (P1) y torniquete (P2) |
| Usuarios | Dirección · Jefatura de aseo · Operarios | Dirección · Portería · Empresas contratistas · Visitantes |

**Suite Optima** = los dos módulos + Centro de control con alertas unificadas.

## 2. Speech de 30 segundos

> "Hoy la mayoría de los recintos gestiona el aseo con planillas y el acceso con un cuaderno en portería. Cuando algo falla, nadie puede demostrar qué pasó.
> Valtek Optima digitaliza las dos cosas en una sola plataforma: tu equipo de aseo registra cada zona desde el celular, con foto y hora, y en portería sabes al instante si una persona puede entrar, porque el sistema revisa sus documentos y su acreditación.
> La dirección ve todo en vivo y tiene reportes listos para cualquier auditoría."

## 3. Speech de 2 minutos (estructura)

1. **Problema** (planillas, WhatsApp y cuaderno; sin trazabilidad). Pregunta: *"Si mañana un apoderado o un auditor les pide demostrar que el baño del segundo piso se limpió a las 10, ¿cómo lo hacen hoy?"*
2. **Módulo 1, Valtek Clean:** asignación de zonas, app sin descargas y monitor en vivo. El dato que más impacta: tiempo promedio por zona y ranking de rendimiento.
3. **Módulo 2, Valtek Access:** contratistas bloqueados automáticamente si un documento vence, y eventos con QR personal y validación en dos etapas (P1 y P2).
4. **Cumplimiento:** consentimiento explícito, eliminación automática de los datos de visitantes a los 30 días (Ley 19.628) y permisos por rol.
5. **Prueba:** piloto operando en el Colegio San Nicolás de Myra (51 zonas monitoreadas a diario).
6. **Cierre:** *"Te propongo un levantamiento sin costo de tu recinto y una demo con tus propias zonas."*

## 4. Mensaje por sector

- **Universidades:** varias sedes y edificios, eventos masivos (titulaciones, admisión, seminarios) y muchos contratistas (aseo, mantención, casinos). *Gancho:* acreditación QR para eventos y control de contratistas por sede.
- **Colegios:** seguridad de los menores. *Gancho:* verificación del certificado de inhabilidades para trabajar con menores; nadie entra con ese documento vencido.
- **Centros comerciales:** baños y áreas comunes impecables todo el día, y alto flujo de proveedores. *Gancho:* rondas de aseo con evidencia fotográfica y tiempos.
- **Clínicas y edificios corporativos:** auditorías e higiene. *Gancho:* protocolos de limpieza trazables y reportes listos para auditoría.

## 5. Guion de demo (10 minutos)

Abrir la landing y bajar a **"Míralo funcionando"**. Entrar con cada perfil en este orden:

1. **Dirección** → *Centro de control*: los dos módulos lado a lado, alertas y actividad en vivo.
2. **Operaria** → *Mis zonas de hoy*: iniciar una zona, elegir el diagnóstico y terminar con foto.
3. **Dirección** → *Monitor en vivo*: se ve el cambio al instante. Luego *Informes*: generar el PDF.
4. **Portería** → buscar el RUT `18.765.432-1` (Pedro Soto): **acceso denegado** por documentos vencidos.
5. **Dirección** → *Eventos y acreditación*: copiar el link, registrar a un visitante y aprobarlo.
6. **Portería** → *Acceso automatizado*: correr la simulación del recorrido P1 → P2.

## 6. Objeciones frecuentes

- **"Mi personal no sabe usar apps."** No se instala nada: se abre un link en el celular y se usa con tres toques.
- **"Ya tenemos torniquetes."** Valtek Access se integra con lectores y torniquetes existentes (por ejemplo, ZKTeco).
- **"¿Y los datos personales?"** Consentimiento explícito, eliminación automática a los 30 días y permisos por rol.
- **"Solo necesito una parte."** Los módulos se contratan por separado.

## 7. Pendientes antes de vender (prototipo → producto)

- Correo real con el QR al aprobar a un visitante (hoy solo aparece un aviso en pantalla).
- QR real escaneable y firmado (hoy es simulado).
- Backend y base de datos multi-cliente (Supabase), con login seguro.
- Integración real con lectores y torniquetes (hoy P1/P2 se simulan en pantalla).
- Datos de contacto comercial reales en la landing (correo o WhatsApp para agendar).

## 8. Valtek Access para industria (demo de planta)

**Enlace directo:** https://juanjovalencia.github.io/valtek-optima/#valtek-access (entra como Jefe de seguridad de la "Planta Industrial Valle Norte"). Para la vista del guardia: `#guardia`.

**Speech de 30 segundos (industria):**
> "En una planta, que entre alguien sin estar habilitado no es un problema administrativo: es un riesgo para su vida y una multa para la empresa. Valtek Access valida a cada persona en la garita, en el torniquete y en las zonas restringidas contra su documentación, su empresa contratista y sus autorizaciones. Si algo está vencido, no entra, y queda registrado. Y si hay una emergencia, sabes exactamente quién está dentro y dónde."

**Guion (5 minutos):**
1. **Panel de seguridad:** personas dentro ahora, ingresos del día, rechazos y por qué, y dónde está la gente. El tráfico se mueve en vivo.
2. **Control de acceso**, con los casos de demostración:
   - *Jorge Muñoz* → Garita: **permitido**. Otra vez → Torniquete: **permitido**. Otra vez → **denegado por anti-passback** (ya está dentro).
   - *Luis Herrera* (eléctrico) → Garita y Torniquete permitidos → Sala eléctrica: **denegado, licencia SEC vencida**.
   - *Cristián Vega* → **denegado, examen pre-ocupacional vencido**.
   - *Andrés Pino* → **denegado, su empresa tiene el F30-1 vencido** (Ley de Subcontratación).
   - *Daniela Soto* → **denegado, sin inducción de seguridad**.
   - *Patricia Lagos* (visita) → Garita permitida → Torniquete **denegado, solo está autorizada para oficinas**.
   - Mostrar **"Autorizar excepción"**: queda registrado quién la autorizó y por qué.
3. **Personas en planta** → **Imprimir lista de evacuación**.
4. **Registro de personas** → ficha con documentos y vencimientos, agregar persona e importar nómina (CSV con columnas `nombre;rut;empresa;cargo`).
5. **Empresas contratistas** → cumplimiento por empresa, F30 / F30-1 y suspensión automática.
6. **Bitácora de accesos** → todo auditable y exportable a Excel (CSV).

Si la demo queda "usada", se puede reiniciar borrando los datos del sitio en el navegador.
