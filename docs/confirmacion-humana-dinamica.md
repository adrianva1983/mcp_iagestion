# Confirmación humana dinámica para acciones destructivas

**Estado**: implementada la versión interina (más abajo), que cubre el
objetivo (código de un solo uso, con caducidad, por email, sin depender de un
secreto estático) sin tocar el backend de iagestión. El diseño original de
este documento (guardar el estado en la base de datos del CRM, vía dos
servicios PHP nuevos) queda como posible evolución futura si algún día hace
falta compartir el estado entre varias instancias del servidor MCP — hoy no
hace falta, porque solo hay una.

## Versión interina implementada (`src/confirmations.ts`, `src/mailer.ts`)

Cada usuario puede tener un `confirmEmail` (`admin add --email` / `admin
set-email` / el panel web). Al superar el umbral de acciones destructivas:

1. El servidor genera un código de 6 dígitos, lo guarda **en memoria** del
   propio proceso (nunca en disco ni en la base de datos del CRM) junto con
   su hash, la tool que lo disparó y su caducidad (`CONFIRM_TTL_MINUTOS`,
   10 minutos por defecto).
2. Lo envía por email con Resend (`RESEND_API_KEY`, credenciales propias del
   MCP, no las de Mailjet de la agencia).
3. Responde a la llamada MCP con un mensaje corto pidiendo el código —
   deliberadamente breve: el freno ya deja claro que hace falta una persona,
   así que no hace falta explicárselo de nuevo cada vez al usuario.
4. Cuando llega una llamada con `confirmacion_humana` que coincide (hash, no
   en claro) y no ha caducado: se consume (un solo uso) y el usuario queda
   aprobado para el **resto de la ventana de 10 minutos** — no hace falta un
   código nuevo en cada llamada siguiente, solo la primera vez que se supera
   el umbral.
5. Un código incorrecto no genera uno nuevo automáticamente mientras el
   anterior siga vigente (evita que reintentos del LLM disparen un email por
   cada uno).
6. Usuarios sin `confirmEmail`, o si falta `RESEND_API_KEY` en el servidor,
   caen al mecanismo estático heredado (`IAGESTION_CONFIRM_TOKEN`), que sigue
   funcionando igual que antes.

Diferencias con el diseño original de más abajo: el estado vive en memoria
del proceso (se pierde en un reinicio, sin coste real porque los códigos
duran minutos), no hay tabla nueva en el CRM ni servicios PHP nuevos, y el
código va siempre al propio usuario que dispara el freno (no a un
"responsable" aparte) — es él quien recibe el email y quien se lo pasa a
Claude.

## Diseño original (base de datos del CRM) — evolución futura, no implementada

## Por qué cambiarlo

El token actual es un secreto **fijo** compartido en texto plano en `.env` (y,
en la práctica, puede acabar circulando por chats/documentación al usarlo).
Problemas concretos:

- No caduca: si se filtra una vez, sirve para siempre hasta que alguien lo rote a mano.
- No es de un solo uso: el mismo valor desbloquea todas las acciones destructivas indefinidamente.
- No hay trazabilidad de quién aprobó qué ni cuándo.
- Vive en el servidor, no en manos del humano que realmente debe aprobar — cualquiera con acceso al `.env` lo tiene, no solo la persona responsable de dar el visto bueno.

## Flujo propuesto

1. `guardDestructiveCall` (en `src/httpServer.ts`) detecta que se ha superado
   el umbral de acciones destructivas (hoy: 5 en 10 minutos — ajustable).
2. En vez de exigir un valor fijo conocido de antemano, el servidor:
   1. Genera un **token de un solo uso** (aleatorio, alta entropía).
   2. Lo guarda en base de datos **hasheado** (nunca en texto plano), junto con metadatos: tool que se intentaba ejecutar, un resumen de los argumentos, marca de tiempo de creación, marca de caducidad, canal de envío, destinatario, y si ya se ha consumido.
   3. Envía el token al humano responsable por **WhatsApp o email** (configurable).
   4. Responde a la llamada MCP original con un error explicando que se ha enviado un código de confirmación al responsable, y que hay que repetir la llamada incluyendo `confirmacion_humana` con ese código una vez el humano se lo facilite a Claude.
3. Cuando llega una nueva llamada con `confirmacion_humana`:
   1. Se busca en base de datos un token pendiente que coincida (comparando el hash), no caducado y no usado.
   2. Si es válido: se marca como usado (no se puede reutilizar) y se deja pasar la llamada original.
   3. Si no es válido/caducado/ya usado: se rechaza con un mensaje claro (sin revelar si el problema es que caducó, que ya se usó o que no existe — evitar dar pistas a un intento de fuerza bruta).

## Modelo de datos

Tabla `confirmaciones_pendientes` (nombre orientativo):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | PK | |
| `token_hash` | string | SHA-256 (o similar) del token real; nunca se guarda en claro |
| `tool_name` | string | Tool que disparó la petición de confirmación |
| `args_resumen` | text/json | Resumen de los argumentos, para trazabilidad — sin volcar datos sensibles innecesarios |
| `access_token` | string | A qué `MCP_ACCESS_TOKEN` pertenece (útil si en el futuro hay más de un cliente/integración) |
| `canal` | enum | `whatsapp` \| `email` |
| `destinatario` | string | Número o email — considerar enmascarar en logs |
| `creado_en` | datetime | |
| `expira_en` | datetime | `creado_en` + TTL configurable (hoy en el mecanismo estático: sin expiración; aquí: obligatorio) |
| `usado_en` | datetime, nullable | Se rellena al consumirse; un token con `usado_en` no nulo nunca vuelve a ser válido |

**Motor de base de datos — DECIDIDO**: se usa la base de datos ya existente
del CRM (la misma que consultan los servicios PHP del backend, p. ej.
`AgenciasAPP` en `D:\descargas\manual_api.html` / el `index.php` de
`/agencia/` que editamos). Nada de un almacén nuevo aparte (se descarta la
opción SQLite embebido que se planteaba al principio).

Nueva tabla propuesta en esa misma base: `ConfirmacionesPendientes` (mismo
estilo de nombre en PascalCase que el resto de tablas del CRM: `AgenciasAPP`,
`AgenciasMLS`, `Provincias`...).

### Cómo accede el servidor MCP a esa base de datos — DECIDIDO: Opción A

Todo pasa por la API, igual que el resto del proyecto: el servidor MCP nunca
toca la base de datos directamente, y no se añaden credenciales de MySQL/PDO
dentro del contenedor Node (que ya está expuesto a internet por el túnel).

Dos endpoints nuevos en el backend PHP, siguiendo exactamente el mismo
patrón que los otros 45 servicios (`POST /api-gestioninmo/v3/{servicio}/`,
auth Bearer, `application/x-www-form-urlencoded`, respuesta JSON):

- `grabar_confirmacion_pendiente` — inserta la fila en `ConfirmacionesPendientes`
  (token ya hasheado desde Node, nunca en claro) y devuelve su Id.
- `validar_confirmacion_pendiente` — recibe el hash a comprobar, busca una
  fila no caducada y no usada, la marca como usada si coincide, y responde
  si era válida o no (sin distinguir en la respuesta el motivo si no lo era —
  ver sección Seguridad).

El servidor MCP los consume con `callIagestion(...)`, exactamente igual que
el resto de las tools — cero credenciales de base de datos nuevas en el
servidor Node, cero variables de entorno adicionales para esto (reutiliza el
`IAGESTION_API_TOKEN` que ya existe).

## Envío del token

### Email
- Reutilizar Mailjet, ya que la propia agencia lo tiene configurado en
  iagestión (`code_mailjet_apikey`/`code_mailjet_apisecret`, ver
  `iagestion_obtener_agencia`) — **decisión pendiente**: usar esas
  credenciales de la agencia, o unas credenciales propias del servidor MCP,
  separadas para no mezclar responsabilidades ni depender de que la agencia
  mantenga su integración de Mailjet activa.
- Alternativa: cualquier proveedor SMTP transaccional (Resend, SendGrid, Postmark...).

### WhatsApp
- WhatsApp Business Cloud API (Meta) directamente, o a través de un proveedor
  (Twilio, MessageBird...). Requiere:
  - Número de WhatsApp Business verificado.
  - Plantilla de mensaje **pre-aprobada** por Meta si se envía fuera de una
    ventana de conversación de 24h (que será el caso normal, ya que esto se
    dispara de forma proactiva, no como respuesta a un mensaje del usuario).

### Decisión de canal
Configurable por variable de entorno (uno, otro, o ambos a la vez como
redundancia). Empezar por el que ya tenga credenciales disponibles.

## Variables de entorno nuevas (propuesta)

```
# Caducidad del token de confirmación
CONFIRMACION_TTL_MINUTOS=10

# Canal(es) de envío: "email" | "whatsapp" | "ambos"
CONFIRMACION_CANAL=email

# Email (si aplica)
CONFIRMACION_EMAIL_DESTINATARIO=responsable@agenciademo.es
MAILER_PROVIDER=mailjet
MAILER_API_KEY=
MAILER_API_SECRET=
MAILER_FROM=no-reply@tu-dominio.com

# WhatsApp (si aplica)
CONFIRMACION_WHATSAPP_DESTINATARIO=+34600000000
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TEMPLATE_NAME=
```

`IAGESTION_CONFIRM_TOKEN` (el mecanismo estático actual) se retira una vez
esto esté en marcha.

## Seguridad

- Token de un solo uso, invalidado inmediatamente al consumirse.
- Caducidad corta (minutos, no horas) — por defecto igual a la ventana
  actual del freno destructivo (10 min), ajustable.
- Solo se guarda el **hash** del token en base de datos; la comparación al
  validar se hace hasheando el valor recibido y comparando hashes (nunca
  comparar el token en claro contra la base de datos).
- Suficiente entropía: mínimo 8 caracteres alfanuméricos aleatorios, o un
  código numérico de 6 dígitos si se prioriza que sea cómodo de teclear desde
  WhatsApp/email (a costa de menos entropía — valorar rate-limiting de
  intentos de verificación si se opta por esto).
- **Rate-limit de generación**: no se debe poder forzar el envío repetido de
  SMS/emails a la misma persona (abuso/spam) — limitar cuántos tokens nuevos
  se generan por ventana de tiempo, igual que ya se limita el resto de la API.
- Auditoría: registrar (sin necesidad de guardar el token en claro) quién
  disparó cada solicitud de confirmación, para qué tool, y si acabó
  usándose, caducando sin usar, o siendo abandonada.
- Mensajes de error genéricos al validar (no revelar si el motivo de
  rechazo es caducidad, ya-usado o inexistente).

## Plan de implementación (checklist)

- [ ] Crear la tabla `ConfirmacionesPendientes` en la base de datos del CRM (migración/SQL a cargo de quien gestione ese esquema).
- [ ] Backend PHP: nuevo servicio `grabar_confirmacion_pendiente`.
- [ ] Backend PHP: nuevo servicio `validar_confirmacion_pendiente`.
- [ ] Servicio en el MCP (`src/confirmacionService.ts` o similar): `crear()`, `enviar()`, `validarYConsumir()` — usando `callIagestion()` para hablar con los dos servicios nuevos.
- [ ] Integración de envío por email (decidir proveedor/credenciales).
- [ ] Integración de envío por WhatsApp (decidir proveedor/plantilla).
- [ ] Sustituir la comprobación estática en `guardDestructiveCall()` (`src/httpServer.ts`) por una llamada a `confirmacionService`.
- [ ] Nuevas variables de entorno (email/WhatsApp/TTL/destinatario) + actualizar `.env.example` y el README.
- [ ] Pruebas: caducidad, un solo uso, rate-limit de generación, ambos canales.
- [ ] Retirar `IAGESTION_CONFIRM_TOKEN` y la documentación del mecanismo estático.

## Decisiones que aún faltan por tomar

1. ~~¿SQLite o una base de datos ya existente en la infraestructura de la agencia?~~ → **Decidido: la base de datos del CRM.**
2. ~~¿Opción A (nuevos servicios PHP en la API) u Opción B (conexión directa a la base de datos)?~~ → **Decidido: Opción A, todo por API.**
3. ¿Credenciales de Mailjet propias del MCP, o reutilizar las de la agencia en iagestión?
4. ¿WhatsApp Business Cloud API directo, o a través de un proveedor (Twilio...)?
5. ¿Un único destinatario fijo de confirmaciones, o configurable por tipo de acción/agencia?
6. ¿Formato del token: alfanumérico largo (más seguro) o numérico corto tipo OTP (más cómodo por WhatsApp/SMS)?
