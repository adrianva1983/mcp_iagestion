# Modo multiusuario

El servidor HTTP atiende a varios usuarios a la vez. Cada uno tiene:

- **Token de acceso** (`imcp_…`): el que se pega en el conector de Claude/Gemini. Identifica al usuario.
- **Token M2M de iagestión**: el suyo propio. Con él se ejecutan todas sus llamadas al CRM, así que cada usuario ve y modifica solo lo que iagestión le permite.

Dónde se guarda (`/data/users.json`, en el volumen `mcp_data`):

| Dato | Cómo |
|---|---|
| Token de acceso | Solo su hash SHA-256. No se puede recuperar; si se pierde se regenera. |
| Token de iagestión | Cifrado con AES-256-GCM usando `USERS_ENCRYPTION_KEY`. |

El servidor recarga el fichero solo (en unos 2 s): dar altas y bajas **no requiere reiniciar**.

> También hay un panel web para todo esto (alta, baja, rotar, ver caducidad, actividad reciente),
> sin salir a la terminal: [docs/panel-administracion.md](panel-administracion.md).

## Configuración inicial (una vez)

En `.env`: `USERS_ENCRYPTION_KEY`, `PUBLIC_BASE_URL` e `IAGESTION_CONFIRM_TOKEN` (ver `.env.example`).
Deja `MCP_ACCESS_TOKEN` e `IAGESTION_API_TOKEN` vacíos.

## Gestión de usuarios

```bash
# Alta: pide el token de iagestión sin eco y muestra el token de acceso y la URL (solo esta vez)
docker compose exec mcp node dist/admin.js add "Ana Pérez"
docker compose exec mcp node dist/admin.js add "Ana Pérez" --dias 30   # caducidad distinta de la por defecto (TOKEN_TTL_DAYS)
docker compose exec mcp node dist/admin.js add "Ana Pérez" --email ana@agencia.es   # código de confirmación por email (ver más abajo)

docker compose exec mcp node dist/admin.js list
docker compose exec mcp node dist/admin.js rotate "Ana Pérez"      # token de acceso nuevo + renueva la caducidad; el anterior deja de valer
docker compose exec mcp node dist/admin.js set-token "Ana Pérez"   # si cambia su token de iagestión
docker compose exec mcp node dist/admin.js set-email "Ana Pérez" ana@agencia.es   # da de alta o cambia su email de confirmación
docker compose exec mcp node dist/admin.js revoke "Ana Pérez"      # baja inmediata
```

## Caducidad y rotación

Cada token de acceso caduca a los `TOKEN_TTL_DAYS` días (180 por defecto) de crearse o rotarse — higiene de seguridad, no porque el token "sepa" caducar por sí solo. Pasada esa fecha, el servidor lo rechaza con un error `-32002` que le pide a la persona que hable contigo.

`admin list` muestra, por usuario, cuándo caduca (con aviso ⚠ si quedan 14 días o menos, o `CADUCADO` si ya pasó) y su último uso. Revísalo de vez en cuando y renueva con `rotate` antes de que caduque, para no dejar a nadie sin acceso de sorpresa.

Los usuarios dados de alta antes de esta funcionalidad no tienen fecha de caducidad («nunca») hasta que se les haga un `rotate`; a partir de ahí quedan sujetos a la misma caducidad que el resto.

Para altas automatizadas sin dejar el token en el historial de la shell:
`printf '%s' "$TOKEN_IAGESTION" | docker compose exec -T mcp node dist/admin.js add "Ana"`.

Sin Docker: `npm run build && npm run admin -- add "Ana"` (con las mismas variables de entorno).

## Cómo conecta cada usuario

- Clientes que solo admiten una URL: `https://mcp.tudominio.com/mcp/<token_de_acceso>`.
- Clientes que admiten cabeceras: URL `https://mcp.tudominio.com/mcp` y `Authorization: Bearer <token_de_acceso>`.
  Es preferible: el token no queda en los logs de acceso del proxy.

## Límites y auditoría

- Rate limit (30 peticiones/min) y freno de acciones destructivas (5 / 10 min) se aplican **por usuario**.
- Cada llamada a una tool deja en el log `usuario=<nombre> (<id>) tool=<tool>`; nunca se registra ningún token.

## Confirmación humana por email

Al superar el freno de acciones destructivas, un usuario con `--email` configurado recibe un
código de un solo uso por correo, en vez de depender del secreto estático `IAGESTION_CONFIRM_TOKEN`.
Requiere `RESEND_API_KEY` en el `.env` del servidor (ver `.env.example` y
[docs/confirmacion-humana-dinamica.md](confirmacion-humana-dinamica.md)). Sin `RESEND_API_KEY`, o
para usuarios sin email configurado, se sigue usando el secreto estático.

## Copias de seguridad

Guarda `USERS_ENCRYPTION_KEY` y el volumen `mcp_data` (o solo `/data/users.json`). Sin la clave, el fichero es inservible; sin el fichero, hay que dar de alta a todos otra vez.

## Modo de un solo usuario (heredado)

Si defines `MCP_ACCESS_TOKEN` e `IAGESTION_API_TOKEN`, ese token sigue funcionando y actúa con ese único token de iagestión. Útil para pruebas; en producción con varios usuarios no lo definas.
