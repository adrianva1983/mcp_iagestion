# Cómo conectar iagestion-mcp

Este documento reúne **todas las formas disponibles** de conectar un cliente
MCP (Claude Desktop, Claude Code, claude.ai web, Gemini CLI...) al servidor
`iagestion-mcp`, y qué opción usar según el caso. No contiene secretos reales
— para los valores en vivo (URL del túnel, tokens) ver
[`estado-actual.local.md`](estado-actual.local.md) (no versionado en git).

## Resumen: dos transportes, dos formas de arrancar

| | Transporte **stdio** | Transporte **HTTP** |
|---|---|---|
| Entrypoint | `src/index.ts` → `node dist/index.js` | `src/httpServer.ts` → `node dist/httpServer.js` |
| Quién lo usa | Claude Desktop, Claude Code, Gemini CLI (apps nativas que lanzan un proceso local) | claude.ai web (conectores remotos), o cualquier cliente que solo pueda pegar una URL |
| Cómo se arranca | El propio cliente MCP lo lanza como proceso hijo | Manualmente, o con Docker (recomendado — queda corriendo solo) |
| Autenticación extra | Ninguna (el proceso ya corre bajo tu usuario) | `MCP_ACCESS_TOKEN` en la URL + rate limit + freno de acciones destructivas |
| Alcance | Solo tu máquina | Accesible desde internet mientras el túnel esté activo |

Las 45 tools son exactamente las mismas en ambos transportes — la única
diferencia es cómo llega la petición al servidor.

---

## Opción 1 · Claude Code (CLI) — stdio local

```powershell
claude mcp add iagestion -s user --env IAGESTION_API_TOKEN=<tu_token_m2m> -- node D:\000Apps\MCP_iagestion\dist\index.js
```

- `-s user`: disponible en todos tus proyectos, guardado en `~/.claude.json`, nunca se sube a ningún repo.
- Verificar: `claude mcp list` (debe mostrar `iagestion: ... ✔ Connected`).
- Quitar: `claude mcp remove iagestion -s user`.
- Requiere `npm run build` hecho al menos una vez (o después de cada cambio de código).

## Opción 2 · Claude Desktop — stdio local

Edita el archivo de configuración de Claude Desktop (en esta instalación,
desde Microsoft Store, vive en
`C:\Users\adria\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`;
en instalaciones normales suele ser `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "iagestion": {
      "command": "node",
      "args": ["D:\\000Apps\\MCP_iagestion\\dist\\index.js"],
      "env": {
        "IAGESTION_API_TOKEN": "TU_TOKEN_M2M_AQUI"
      }
    }
  }
}
```

Tras guardar, **reinicia Claude Desktop por completo** (salir desde el icono
de la bandeja del sistema, no solo cerrar la ventana).

## Opción 3 · claude.ai (web) — conector remoto HTTP

claude.ai web corre en el navegador: no puede lanzar un proceso local, así
que necesita el transporte HTTP (ver "Arrancar el servidor HTTP" más abajo)
expuesto por una URL pública (túnel, o un despliegue con dominio propio).

1. **Ajustes → Conectores → Agregar conector personalizado.**
2. Pega la URL completa, incluido el token al final:
   ```
   https://<host-del-túnel>/mcp/<MCP_ACCESS_TOKEN>
   ```
3. Autenticación: deja **"Sin inicio de sesión"** (se detecta solo) — el
   token va embebido en la propia URL, no hace falta tocar "Encabezados de
   solicitud".
4. Guarda. En cada conversación nueva, actívalo desde el icono **"+"** del
   chat → Conectores, si no aparece ya activo.
5. **Cada vez que cambie la URL del túnel** (ver más abajo por qué cambia),
   hay que editar o borrar/recrear este conector con la URL nueva.

## Opción 4 · Gemini CLI — stdio local (no configurado todavía en esta máquina)

Mismo patrón que Claude Code: añadir una entrada en el `mcpServers` de la
configuración de Gemini CLI (`~/.gemini/settings.json` o equivalente) con
`command`/`args`/`env` apuntando al mismo `dist/index.js`. Pendiente de
hacer si llega a usarse.

---

## Arrancar el servidor HTTP (necesario para las opciones que usan URL)

### Con Docker (recomendado — queda corriendo solo)

```powershell
cd D:\000Apps\MCP_iagestion
docker compose up -d --build
```

Levanta dos contenedores (ver [`docker-compose.yml`](../docker-compose.yml)):

- **`mcp`**: el servidor HTTP en sí, con `restart: unless-stopped` — vuelve a
  arrancar solo si se reinicia Docker Desktop o el PC. Expuesto también en
  `http://localhost:3917` por si quieres probarlo sin salir a internet.
- **`tunnel`**: túnel rápido de Cloudflare (`cloudflare/cloudflared`) que le
  da una URL pública. También con `restart: unless-stopped`.

Comandos útiles:

```powershell
docker compose ps                 # estado de los contenedores
docker compose logs tunnel        # saca la URL pública actual (busca *.trycloudflare.com)
docker compose logs -f mcp        # logs del servidor en vivo
docker compose down               # para y elimina ambos contenedores
```

**⚠️ Importante — la URL cambia**: al ser un túnel rápido (gratis, sin
dominio propio), Cloudflare asigna una URL aleatoria distinta **cada vez**
que se recrea el contenedor `tunnel` — incluido cada reinicio de Docker
Desktop o del PC, aunque `docker compose` no haya tocado nada explícitamente
(el contenedor se reinicia solo por la política `restart: unless-stopped`, y
al reiniciar pide una URL nueva). Después de cualquier reinicio, comprueba la
URL vigente con `docker compose logs tunnel` y actualiza el conector de
claude.ai si ha cambiado.

Si algún día se quiere una URL fija que no cambie nunca, hace falta un
dominio propio dado de alta en Cloudflare (túnel con nombre, no "quick
tunnel") — pendiente, no configurado todavía.

### Sin Docker (manual, dos terminales)

**Terminal 1:**
```powershell
cd D:\000Apps\MCP_iagestion
$env:IAGESTION_API_TOKEN = "TU_TOKEN_M2M"
$env:MCP_ACCESS_TOKEN = "TU_TOKEN_DE_ACCESO_PROPIO"
$env:IAGESTION_CONFIRM_TOKEN = "TU_TOKEN_DE_CONFIRMACION"
$env:PORT = "3917"
node dist\httpServer.js
```

**Terminal 2:**
```powershell
npx cloudflared tunnel --url http://localhost:3917
```

Parar: Ctrl+C en cada terminal.

---

## Opciones de configuración (variables de entorno)

| Variable | Dónde se usa | Obligatoria | Descripción |
|---|---|---|---|
| `IAGESTION_API_TOKEN` | stdio y HTTP | Sí | Token M2M Bearer hacia la API real de iagestión. |
| `MCP_ACCESS_TOKEN` | solo HTTP | Sí (el servidor no arranca sin ella) | Secreto propio del servidor; se exige en la URL (`/mcp/<token>`) o como `Authorization: Bearer`. |
| `IAGESTION_CONFIRM_TOKEN` | solo HTTP | No, pero sin ella el freno de acciones destructivas nunca se puede desbloquear tras superar el umbral (falla cerrado) | Token de confirmación humana — ver [`confirmacion-humana-dinamica.md`](confirmacion-humana-dinamica.md) para el diseño de la versión definitiva (dinámica, con caducidad y envío por WhatsApp/email; hoy es estático). |
| `PORT` | solo HTTP | No (por defecto 3000; en Docker se fuerza a 3000 internamente y se publica en 3917 del host) | Puerto de escucha. |

Plantilla completa en [`.env.example`](../.env.example).

## Protecciones activas del transporte HTTP

(No aplican al stdio local — ver detalle en el propio [`README.md`](../README.md#seguridad-del-transporte-http-remoto).)

- **Rate limit**: 30 peticiones/minuto por `MCP_ACCESS_TOKEN` → `HTTP 429` + `Retry-After`.
- **Freno a acciones destructivas**: más de 5 llamadas a tools de
  `actualizar_*`/`eliminar_*`/`desvincular_propietario`/
  `publicar_despublicar_inmueble`/`gestionar_lead` en 10 minutos → error JSON-RPC
  `-32010` (HTTP 200 a propósito, para que el conector no lo confunda con un fallo
  de autenticación) hasta que la llamada incluya
  `"confirmacion_humana": "<IAGESTION_CONFIRM_TOKEN>"`.
- **Censura de credenciales**: `iagestion_obtener_agencia` e
  `iagestion_listar_inmobiliarias` nunca devuelven campos que contengan
  `pass`, `secret`, `apikey`, `api_key` o `token` en su nombre — se sustituyen
  por `[REDACTADO]` antes de salir del servidor.

## Diagnóstico rápido

```powershell
# ¿Está vivo el contenedor?
docker compose ps

# ¿Responde el servidor HTTP en local?
curl http://localhost:3917/health

# ¿Responde a través del túnel? (sustituye por la URL vigente)
curl https://<host-del-túnel>/health

# ¿Qué tools expone ahora mismo?
curl -X POST https://<host-del-túnel>/mcp/<MCP_ACCESS_TOKEN> `
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" `
  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'
```

Si claude.ai devuelve `"Tool not found"` teniendo el conector activado, casi
siempre es que cacheó una lista de tools antigua (p. ej. de antes de un
rename) — quita y vuelve a añadir el conector para forzar que la relea.
