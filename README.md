# gestioninmo-mcp

Servidor MCP (Model Context Protocol) en TypeScript/Node.js para interactuar
con la **API v3 de gestioninmo** (iagestión) vía stdio, pensado para usarse
desde Claude Desktop, Claude Code u otros clientes MCP.

## Arquitectura de la API cubierta

- Base URL: `https://pasarelas.iagestion.com/api-gestioninmo/v3/{servicio}/`
- Método: `POST` en todos los endpoints, `Content-Type: application/x-www-form-urlencoded`.
- Auth: cabecera `Authorization: Bearer <TOKEN_M2M>`.
- Peculiaridad de negocio: la API puede responder `HTTP 200` con
  `{"validacion":"error","mensaje":"..."}` o `{"error": true, ...}`. El
  servidor detecta este patrón en [src/client.ts](src/client.ts) y lo
  convierte en una excepción que las tools transforman en `isError: true`
  para MCP.

## Estructura del proyecto

```
src/
  client.ts          # Cliente HTTP: auth, form-urlencoded, detección de error de negocio con HTTP 200
  toolResult.ts       # Helpers para formatear resultados/errores en el formato MCP
  index.ts            # Entrypoint: crea el McpServer y conecta el transporte stdio
  tools/
    inmuebles.ts       # gestioninmo_buscar_inmuebles, obtener_inmueble, crear_inmueble, actualizar_inmueble
    contactos.ts        # gestioninmo_buscar_contactos, crear_contacto
    demandas.ts          # gestioninmo_buscar_demandas, crear_demanda
    gestiones.ts          # gestioninmo_registrar_gestion
    catalogos.ts           # gestioninmo_consultar_catalogos
```

## Tools expuestas

| Tool | Servicio REST | Descripción |
|---|---|---|
| `gestioninmo_buscar_inmuebles` | `POST /inmuebles/` | Búsqueda y listado de propiedades con filtros y paginación. |
| `gestioninmo_obtener_inmueble` | `POST /inmueble/` | Ficha técnica completa de una propiedad por `Id` o `Ref`. |
| `gestioninmo_crear_inmueble` | `POST /grabar_inmueble/` | Alta de una nueva propiedad. |
| `gestioninmo_actualizar_inmueble` | `POST /actualizar_inmueble/` | Modificación de una propiedad existente. |
| `gestioninmo_buscar_contactos` | `POST /contactos/` | Búsqueda de personas/clientes en el CRM. |
| `gestioninmo_crear_contacto` | `POST /grabar_contacto/` | Alta de un nuevo contacto. |
| `gestioninmo_buscar_demandas` | `POST /demandas/` | Búsqueda de demandas (requerimientos de compradores/inquilinos). |
| `gestioninmo_crear_demanda` | `POST /grabar_demanda/` | Registro de criterios de búsqueda de un cliente. |
| `gestioninmo_registrar_gestion` | `POST /grabar_gestion/` | Registro de una interacción comercial (visita, llamada, email, reunión). |
| `gestioninmo_consultar_catalogos` | `POST /provincias/` \| `/municipios/` \| `/poblaciones/` \| `/tipo_inmueble/` | Catálogos maestros, seleccionados por el parámetro `catalogo`. |

Cada tool está definida con un esquema [Zod](https://zod.dev) que valida
tipos, formatos (fechas `YYYY-MM-DD`, horas `HH:mm`, email) y las
combinaciones "al menos uno de" que exige la API (p. ej. `Id` o `Ref`,
`Email` o `Movil`, etc.).

## Instalación

```bash
npm install
npm run build
```

## Configuración

El token M2M se lee de la variable de entorno `GESTIONINMO_API_TOKEN`. Si no
está definida, el servidor arranca igualmente (avisa por stderr) pero
cualquier llamada a una tool devolverá un error MCP legible indicando que
falta el token.

## Uso en Claude Desktop

Añade lo siguiente a tu `claude_desktop_config.json` (ajusta la ruta al
`dist/index.js` compilado):

```json
{
  "mcpServers": {
    "gestioninmo": {
      "command": "node",
      "args": ["D:\\000Apps\\MCP_iagestion\\dist\\index.js"],
      "env": {
        "GESTIONINMO_API_TOKEN": "TU_TOKEN_M2M_AQUI"
      }
    }
  }
}
```

Tras guardar el archivo, reinicia Claude Desktop. Las 10 tools
`gestioninmo_*` aparecerán disponibles en la conversación.

## Seguridad del transporte HTTP remoto

`src/httpServer.ts` (no aplica al stdio local de Claude Desktop/Code, que ya corre bajo control
directo del usuario) implementa dos capas adicionales, pensadas para cuando el servidor está
expuesto a internet (túnel, PaaS...).

**Multiusuario**: cada usuario tiene su propio token de acceso y su propio token M2M de iagestión
(cifrado en reposo), y las altas/bajas se hacen con `node dist/admin.js` (o desde el panel web,
[docs/panel-administracion.md](docs/panel-administracion.md)) sin reiniciar. Guía completa en
[docs/multiusuario.md](docs/multiusuario.md). Además:

- **Rate limiting**: máx. 30 peticiones/minuto por usuario. Al superarlo, responde
  `HTTP 429` con cabecera `Retry-After` y un mensaje indicando cuándo se restablece.
- **Freno a acciones destructivas**: las llamadas a tools de `actualizar_*`, `eliminar_*`,
  `desvincular_propietario`, `publicar_despublicar_inmueble` y `gestionar_lead` se cuentan en una
  ventana de 10 minutos. Al superar 5 en ese periodo, todas las siguientes se bloquean
  (`HTTP 403`) hasta que la llamada incluya `"confirmacion_humana": "<IAGESTION_CONFIRM_TOKEN>"`
  entre los argumentos de la tool — un token que solo debe conocer una persona, nunca el propio
  LLM, para frenar una cadena de modificaciones/borrados sin que un humano la apruebe
  explícitamente. Sin `IAGESTION_CONFIRM_TOKEN` configurado, el bloqueo no se puede levantar
  (falla cerrado). Se implementa interceptando la petición JSON-RPC antes de que llegue a
  cualquiera de las tools — no requiere tocar sus esquemas Zod individuales.

Ambos contadores viven en memoria del proceso (no persisten entre reinicios del contenedor `mcp`)
y son independientes por usuario.

> **Pendiente**: `IAGESTION_CONFIRM_TOKEN` es un secreto estático provisional. El diseño para
> sustituirlo por un token dinámico (guardado en base de datos, con caducidad, enviado al
> responsable por WhatsApp o email) está documentado en
> [docs/confirmacion-humana-dinamica.md](docs/confirmacion-humana-dinamica.md), pendiente de implementar.

> **Producción en un VPS con dominio propio**: usa `docker-compose.prod.yml` (Caddy con HTTPS
> automático en lugar del túnel). Guía en [docs/despliegue-vps.md](docs/despliegue-vps.md).

## Docker (recomendado para tenerlo siempre arriba)

Con Docker no hace falta abrir manualmente dos terminales (servidor + túnel): `docker compose up -d`
levanta ambos contenedores, y con `restart: unless-stopped` vuelven a arrancar solos si reinicias
Docker Desktop o el PC.

```powershell
cd D:\000Apps\MCP_iagestion
copy .env.example .env
notepad .env   # multiusuario: USERS_ENCRYPTION_KEY, PUBLIC_BASE_URL e IAGESTION_CONFIRM_TOKEN
               # un solo usuario: IAGESTION_API_TOKEN y MCP_ACCESS_TOKEN

docker compose up -d --build
docker compose exec mcp node dist/admin.js add "Nombre"   # alta de un usuario (multiusuario)
```

Esto levanta dos contenedores:
- **`mcp`**: el servidor MCP HTTP (este repo), expuesto también en `http://localhost:3917` por si
  quieres probarlo sin salir a internet. Incluye `HEALTHCHECK` contra `/health`.
- **`tunnel`**: un túnel rápido de Cloudflare (`cloudflare/cloudflared`) que expone `mcp` a internet.

La URL pública sale en los logs del segundo:

```powershell
docker compose logs tunnel
# busca la línea con https://algo-aleatorio.trycloudflare.com
```

Esa es la URL a pegar en el conector de claude.ai (`.../mcp/<token_de_acceso_del_usuario>`), igual que en el uso
manual. Sigue siendo aleatoria en cada `docker compose up` (túnel rápido, sin dominio propio) — si
recreas el contenedor `tunnel`, cambia y hay que actualizar el conector.

**Comandos útiles:**
```powershell
docker compose ps                 # estado de los contenedores
docker compose logs -f mcp        # logs del servidor
docker compose logs -f tunnel     # logs del túnel (URL pública)
docker compose restart tunnel     # fuerza una URL nueva sin tocar el servidor
docker compose down               # para y elimina los contenedores
```

Si no quieres exponerlo a internet (solo usarlo en local, p. ej. desde Claude Desktop apuntando a
`http://localhost:3917`), borra o comenta el servicio `tunnel` en [docker-compose.yml](docker-compose.yml).

## Desarrollo

```bash
npm run dev        # ejecuta src/index.ts con recarga automática (tsx watch)
npm run typecheck   # solo comprobación de tipos, sin emitir
npm run build        # compila a dist/
npm start              # ejecuta dist/index.js
```

## Notas de implementación

- Los parámetros que la API acepta como "texto o array JSON" (p. ej.
  `Municipio` en `gestioninmo_crear_demanda`) se serializan automáticamente
  a JSON cuando se pasa un array (ver `toFormBody` en
  [src/client.ts](src/client.ts)).
- Todas las respuestas exitosas se devuelven a Claude como un bloque de
  texto con el JSON formateado (`JSON.stringify(data, null, 2)`).
- Los errores (de red, HTTP o de negocio con HTTP 200) siempre se devuelven
  como `isError: true` con un mensaje legible, nunca como una excepción sin
  capturar.
