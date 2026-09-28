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

## Configuración inicial (una vez)

En `.env`: `USERS_ENCRYPTION_KEY`, `PUBLIC_BASE_URL` e `IAGESTION_CONFIRM_TOKEN` (ver `.env.example`).
Deja `MCP_ACCESS_TOKEN` e `IAGESTION_API_TOKEN` vacíos.

## Gestión de usuarios

```bash
# Alta: pide el token de iagestión sin eco y muestra el token de acceso y la URL (solo esta vez)
docker compose exec mcp node dist/admin.js add "Ana Pérez"

docker compose exec mcp node dist/admin.js list
docker compose exec mcp node dist/admin.js rotate "Ana Pérez"      # token de acceso nuevo; el anterior deja de valer
docker compose exec mcp node dist/admin.js set-token "Ana Pérez"   # si cambia su token de iagestión
docker compose exec mcp node dist/admin.js revoke "Ana Pérez"      # baja inmediata
```

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

## Copias de seguridad

Guarda `USERS_ENCRYPTION_KEY` y el volumen `mcp_data` (o solo `/data/users.json`). Sin la clave, el fichero es inservible; sin el fichero, hay que dar de alta a todos otra vez.

## Modo de un solo usuario (heredado)

Si defines `MCP_ACCESS_TOKEN` e `IAGESTION_API_TOKEN`, ese token sigue funcionando y actúa con ese único token de iagestión. Útil para pruebas; en producción con varios usuarios no lo definas.
