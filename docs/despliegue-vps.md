# Despliegue en un VPS con dominio propio

Servidor MCP multiusuario detrás de Caddy, que sirve HTTPS con certificado de Let's Encrypt renovado solo.

```
Cliente (Claude) ──HTTPS──▶ Caddy :80/:443 ──HTTP──▶ contenedor mcp :3000 (solo red interna de Docker)
```

## 1. DNS
Crea un registro **A** de un subdominio (p. ej. `mcp.tudominio.com`) con la IP pública del VPS.
Comprueba que resuelve antes de seguir: `nslookup mcp.tudominio.com`.

## 2. Servidor
Necesitas Docker con el plugin Compose. Abre solo lo imprescindible en el cortafuegos:

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

(Docker publica puertos saltándose ufw: por eso `mcp` no publica ninguno; solo Caddy expone 80 y 443.)

## 3. Código y configuración

```bash
git clone https://github.com/adrianva1983/mcp_iagestion.git && cd mcp_iagestion
cp .env.example .env
nano .env
chmod 600 .env
```

En `.env` rellena:

| Variable | Valor |
|---|---|
| `MCP_DOMAIN` | `mcp.tudominio.com` (sin `https://`) |
| `USERS_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `IAGESTION_CONFIRM_TOKEN` | otro valor generado igual |

Deja vacíos `MCP_ACCESS_TOKEN` e `IAGESTION_API_TOKEN` (son del modo de un solo usuario).
Usa valores nuevos, no los de desarrollo. **Guarda `USERS_ENCRYPTION_KEY` fuera del servidor también**: sin ella no se pueden descifrar los usuarios.

## 4. Arranque

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy   # verás cómo obtiene el certificado
curl https://mcp.tudominio.com/health
```

## 5. Alta de usuarios

```bash
alias mcp-admin='docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js'
mcp-admin add "Ana Pérez"
```

Muestra el token de acceso y la URL para el conector una única vez. Más comandos en [multiusuario.md](multiusuario.md).

También hay un panel web para lo mismo (y para ver la actividad reciente), accesible por túnel
SSH sin contraseña propia: [docs/panel-administracion.md](panel-administracion.md).

## Operación

```bash
git pull && docker compose -f docker-compose.prod.yml up -d --build   # actualizar
docker compose -f docker-compose.prod.yml logs -f mcp                 # quién llama a qué tool
docker compose -f docker-compose.prod.yml ps
```

Copias de seguridad: el volumen `mcp_data` (usuarios) y `USERS_ENCRYPTION_KEY`. Conserva también `caddy_data` para no repetir la emisión de certificados en cada redespliegue (Let's Encrypt limita el número de emisiones por semana).

## Notas de seguridad

- El token de acceso va en la URL (`/mcp/<token>`). Caddy no registra accesos (no hay directiva `log`); no añadas monitores externos que guarden la URL. Los clientes que admiten cabeceras pueden usar `https://mcp.tudominio.com/mcp` con `Authorization: Bearer <token>`.
- Solo `/mcp` y `/health` llegan al servidor; cualquier otra ruta da 404.
- Si sospechas que un token se ha filtrado: `mcp-admin rotate "Nombre"` (o `revoke`), efecto inmediato.
