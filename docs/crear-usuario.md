# Cómo dar de alta un usuario nuevo

Pasos para añadir a alguien al servidor MCP en el VPS (`mcp-ia.iagestion.com`).

> Esto también se puede hacer desde el panel web, sin entrar por SSH a teclear comandos:
> [docs/panel-administracion.md](panel-administracion.md). Aquí se explica la vía por terminal.

## 0. Lo que necesitas antes de empezar

- Acceso SSH al VPS.
- El **token M2M de iagestión** de esa persona (formato `giak_…`). Lo da iagestión;
  no lo inventas tú. Cada usuario tiene el suyo — no reutilices el mismo token para
  varias personas, porque el rate limit, el freno de acciones destructivas y la
  auditoría de logs se aplican por usuario, no por token de iagestión.

## 1. Conéctate al VPS y entra en la carpeta del proyecto

```bash
ssh ubuntu@TU_IP_O_HOST
cd ~/mcp_iagestion
```

## 2. Da de alta al usuario

```bash
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js add "Nombre Apellido" --confirm-code
```

El `--confirm-code` es opcional: es el código que esa persona debe indicar (en `confirmacion_humana`)
cuando encadene varias acciones destructivas (actualizar/eliminar) seguidas. Sin valor detrás (como
arriba), se autogenera y se muestra una sola vez; si prefieres elegirlo tú, `--confirm-code 4821`.
Sin este flag, depende del código compartido `IAGESTION_CONFIRM_TOKEN` que gestiones tú (ver
`docs/confirmacion-humana-dinamica.md`).

El comando pedirá el token M2M de iagestión de esa persona. **Al pegarlo no se ve nada en
pantalla** (es intencional, para que no quede en el historial de la terminal). Pega
con cuidado de no dejar espacios ni saltos de línea antes o después, y pulsa `Enter`.

La salida es algo así:

```
Usuario dado de alta en /data/users.json.

Usuario: Nombre Apellido (id 1b93cb19)
Token de acceso (se muestra UNA sola vez, no se puede recuperar):
  imcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
URL para el conector remoto (clientes que solo admiten pegar una URL):
  https://mcp-ia.iagestion.com/mcp/imcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Copia el token de acceso (`imcp_…`) en ese momento.** No se guarda en claro en
ningún sitio y no se puede volver a mostrar; si se pierde, la única solución es
regenerarlo (paso 5).

## 3. Pásale el acceso a esa persona

Por un canal privado (no por email sin cifrar, ni Slack público, ni pegado en un
chat con más gente): la URL completa del paso anterior.

```
https://mcp-ia.iagestion.com/mcp/imcp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Instrucciones para esa persona, en claude.ai: **Ajustes → Conectores → Añadir
conector personalizado**, pegar esa URL, guardar.

## 4. Comprueba que ha quedado bien dado de alta

```bash
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js list
```

Debe aparecer su nombre en la lista. Para confirmar que responde de verdad, pídele
que pruebe algo sencillo desde Claude, por ejemplo "consulta el catálogo de
provincias", y mira el log del servidor:

```bash
docker compose -f docker-compose.prod.yml logs -f mcp
```

Debe salir una línea `usuario=Nombre Apellido (id) tool=iagestion_consultar_catalogos`.

## Otras operaciones sobre un usuario ya existente

```bash
# Listar todos los usuarios
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js list

# Regenerar su token de acceso (el anterior deja de funcionar al instante) y
# renovarle la caducidad. Úsalo si el token se ha visto expuesto (capturas,
# chats, logs), si la persona lo ha perdido, o cuando esté a punto de caducar.
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js rotate "Nombre Apellido"
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js rotate "Nombre Apellido" --dias 30   # caducidad distinta de la habitual

# Cambiar su token M2M de iagestión (p. ej. si iagestión se lo ha regenerado)
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js set-token "Nombre Apellido"

# Dar de alta o cambiar su código de confirmación humana propio (autogenerado, o "... 4821" para elegirlo)
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js set-confirm-code "Nombre Apellido"

# Dar de baja (efecto inmediato, no reversible salvo volver a hacer "add")
docker compose -f docker-compose.prod.yml exec mcp node dist/admin.js revoke "Nombre Apellido"
```

## Errores típicos

| Síntoma | Causa probable | Solución |
|---|---|---|
| Claude responde `HTTP 401 – Token de autenticación inválido o revocado` al llamar a una tool | El token M2M de iagestión guardado no es válido (mal copiado, caducado, o formato equivocado) | Comprueba el token directamente contra iagestión (ver abajo) y corrígelo con `set-token` |
| El conector dice "Este conector no tiene herramientas disponibles" | El token de acceso (`imcp_…`) de la URL no es correcto, o el usuario fue revocado | Revisa la URL pegada en el conector; si hace falta, `rotate` y actualiza la URL |
| Error `-32002`, "Tu token de acceso caducó el…" | Pasó la fecha de caducidad del token de acceso (por defecto 180 días desde el alta o el último `rotate`) | `admin rotate "Nombre"` y pásale la URL nueva |
| `curl` a `/mcp/<token>` da 401 | Token de acceso incorrecto o el usuario no existe | `admin list` para comprobar que existe, o `add`/`rotate` |
| Error `-32010` pidiendo confirmación y el usuario no sabe qué código usar | No tiene código propio, o se le olvidó el que le diste | Recuérdaselo, o cámbialo con `admin set-confirm-code "Nombre" <código nuevo>` |

Para comprobar un token M2M de iagestión directamente, sin pasar por nuestro
servidor:

```bash
curl -sS -i -X POST https://pasarelas.iagestion.com/api-gestioninmo/v3/provincias/ \
  -H "Authorization: Bearer EL_TOKEN_GIAK" \
  -d "pais=España"
```

Si responde con una lista de provincias, el token es válido. Si responde 401,
pide un token nuevo a iagestión.
