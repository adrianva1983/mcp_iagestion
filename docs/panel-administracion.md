# Panel de administración (dashboard)

Interfaz web para gestionar usuarios sin usar la terminal: alta, baja, rotar token, cambiar el
token de iagestión, ver caducidad y último uso, y la actividad reciente (qué usuario ha llamado a
qué tool y cuándo). Es una alternativa al CLI (`docs/multiusuario.md`), no lo sustituye — ambos
leen y escriben el mismo `/data/users.json`.

## Modelo de seguridad: sin contraseña propia

El panel **no tiene login**. Se apoya por completo en que su puerto (8081 por defecto) está
publicado **solo en `127.0.0.1` del VPS** (ver `docker-compose.prod.yml`). Quien tiene acceso SSH
al servidor, tiene acceso al panel; quien no, no puede ni intentarlo. Es una decisión deliberada
para no gestionar una contraseña más — el mismo acceso que ya controlas por SSH.

**Nunca** publiques ese puerto como `"8081:8081"` (sin `127.0.0.1:` delante) ni lo pongas detrás de
Caddy o de cualquier proxy público: cualquiera con la URL podría dar de alta o revocar usuarios sin
autenticarse.

## Cómo entrar

Desde tu ordenador, abre un túnel SSH al VPS:

```bash
ssh -L 8081:127.0.0.1:8081 usuario@tu-vps
```

Y, mientras esa terminal siga abierta, visita en el navegador:

```
http://127.0.0.1:8081/admin
```

Al cerrar la sesión SSH se cierra también el acceso al panel.

## Qué se puede hacer

- **Nuevo usuario**: nombre, su token M2M de iagestión, código de confirmación humana propio
  (opcional, con un botón "Generar" si no quieres inventártelo) y, opcionalmente, días de validez
  distintos del habitual (`TOKEN_TTL_DAYS`). Al crearlo se muestra el token de acceso, la URL del
  conector y el código de confirmación (si le pusiste uno) **una sola vez** — cópialos ahí mismo,
  como con `admin add`.
- **Tabla de usuarios**: fecha de alta, caducidad (con aviso si quedan 14 días o menos, o
  "caducado"), último uso, si tiene código de confirmación propio o usa el compartido, y botones
  para **rotar** el token de acceso, **cambiar** el token de iagestión, **código de confirmación**
  (un único diálogo: escríbelo a mano, pulsa "Generar" para uno al azar, o déjalo vacío para volver
  al compartido) o **revocar** al usuario.
- **Actividad reciente**: las últimas llamadas a tools, con fecha, usuario y nombre de la tool
  (nunca argumentos ni tokens). Por defecto solo la última hora; hay un selector para ampliar a
  24 horas, 7 días o todo, además del filtro por usuario. Se guarda en `/data/audit.jsonl`, aparte
  de los logs de Docker, con un límite de 5000 líneas (configurable con `AUDIT_MAX_LINES`).

Todas las confirmaciones y peticiones de datos del panel (rotar, cambiar token, código de
confirmación, revocar) usan un diálogo propio, no los `prompt`/`confirm`/`alert` del navegador.

## Configuración

Nada es obligatorio: con el `.env` de multiusuario ya montado, el panel arranca solo, en el mismo
proceso que el servidor MCP. Variables opcionales:

| Variable | Por defecto | Para qué |
|---|---|---|
| `ADMIN_PORT` | `8081` | Puerto del panel. |
| `ADMIN_UI_ENABLED` | (activado) | Ponla en `false` para desactivar el panel por completo. |
| `AUDIT_MAX_LINES` | `5000` | Cuántas llamadas recientes se conservan en `audit.jsonl`. |

## Por qué un fallo aquí no tumba el servidor MCP

El panel corre en el mismo proceso que el servidor MCP pero en su propio puerto y su propio
servidor Express; un error al arrancarlo (p. ej. el puerto 8081 ya en uso) se registra en el log y
el servidor MCP sigue funcionando con normalidad.
