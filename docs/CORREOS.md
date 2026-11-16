# Textos en español para los correos de la plataforma

Estos son los correos automáticos que Supabase envía a las personas con cuenta. Vienen en inglés: hay que reemplazarlos por estos textos **una sola vez**, después de conectar Resend (pasos en `docs/BACKEND.md`, "Correos del dominio").

Dónde se pegan: Supabase → proyecto `valtek-optima` → **Authentication → Emails → Templates**. Cada plantilla tiene un campo "Subject" (asunto) y un cuadro con el mensaje.

No cambiar lo que está entre llaves dobles, como `{{ .ConfirmationURL }}`: Supabase lo reemplaza por el enlace de cada persona.

Estos correos son solo los de la plataforma. Los correos comerciales para pedir reuniones a instituciones se trabajan aparte.

---

## 1. Confirmar la cuenta (plantilla "Confirm signup")

**Asunto:** `Confirma tu cuenta en Valtek Optima`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1f2b;line-height:1.5;">
  <p style="font-size:18px;font-weight:bold;margin:0 0 20px;">Valtek Optima</p>
  <p>Hola:</p>
  <p>Recibimos una solicitud para crear una cuenta en Valtek Optima con este correo. Para activarla, confirma tu dirección:</p>
  <p style="margin:28px 0;"><a href="{{ .ConfirmationURL }}" style="background:#5d79f4;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block;">Confirmar mi cuenta</a></p>
  <p style="font-size:13px;color:#5b6472;">Si el botón no funciona, copia esta dirección y pégala en tu navegador:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size:13px;color:#5b6472;">Después de confirmar, la administración de tu institución debe darte acceso con este mismo correo.</p>
  <p style="font-size:13px;color:#5b6472;">Si no pediste esta cuenta, puedes ignorar este mensaje.</p>
  <hr style="border:none;border-top:1px solid #e3e6ec;margin:24px 0;">
  <p style="font-size:12px;color:#8a93a3;">Valtek Optima · valtekoptima.cl<br>Este correo se envía de forma automática. Para escribirnos: contacto@valtekoptima.cl</p>
</div>
```

## 2. Recuperar la contraseña (plantilla "Reset Password")

**Asunto:** `Crea una nueva contraseña para Valtek Optima`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1f2b;line-height:1.5;">
  <p style="font-size:18px;font-weight:bold;margin:0 0 20px;">Valtek Optima</p>
  <p>Hola:</p>
  <p>Alguien pidió crear una nueva contraseña para la cuenta de Valtek Optima asociada a este correo. Si fuiste tú, sigue este enlace:</p>
  <p style="margin:28px 0;"><a href="{{ .ConfirmationURL }}" style="background:#5d79f4;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block;">Crear nueva contraseña</a></p>
  <p style="font-size:13px;color:#5b6472;">Si el botón no funciona, copia esta dirección y pégala en tu navegador:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size:13px;color:#5b6472;">Si no lo pediste, ignora este mensaje: tu contraseña actual sigue funcionando.</p>
  <hr style="border:none;border-top:1px solid #e3e6ec;margin:24px 0;">
  <p style="font-size:12px;color:#8a93a3;">Valtek Optima · valtekoptima.cl<br>Este correo se envía de forma automática. Para escribirnos: contacto@valtekoptima.cl</p>
</div>
```

## 3. Cambio de correo (plantilla "Change Email Address")

**Asunto:** `Confirma tu nuevo correo en Valtek Optima`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1f2b;line-height:1.5;">
  <p style="font-size:18px;font-weight:bold;margin:0 0 20px;">Valtek Optima</p>
  <p>Hola:</p>
  <p>Pediste cambiar el correo de tu cuenta de Valtek Optima a <strong>{{ .NewEmail }}</strong>. Para confirmar el cambio:</p>
  <p style="margin:28px 0;"><a href="{{ .ConfirmationURL }}" style="background:#5d79f4;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block;">Confirmar nuevo correo</a></p>
  <p style="font-size:13px;color:#5b6472;">Si el botón no funciona, copia esta dirección y pégala en tu navegador:<br>{{ .ConfirmationURL }}</p>
  <p style="font-size:13px;color:#5b6472;">Si no pediste este cambio, ignora este mensaje y avísanos a contacto@valtekoptima.cl.</p>
  <hr style="border:none;border-top:1px solid #e3e6ec;margin:24px 0;">
  <p style="font-size:12px;color:#8a93a3;">Valtek Optima · valtekoptima.cl<br>Este correo se envía de forma automática.</p>
</div>
```

---

## Qué falta

- **Correo con el QR de acreditación** (etapa 5, Eventos): no es una plantilla de Supabase. Lo enviará una función propia a través de Resend, con el QR adjunto, cuando la administración apruebe a un visitante.
- Las plantillas "Invite user" y "Magic Link" de Supabase no se usan hoy: la página no invita por correo ni ofrece ingreso sin contraseña.
