#!/usr/bin/env node
/**
 * iagestion-mcp (HTTP remoto)
 *
 * Expone el mismo servidor MCP vía Streamable HTTP para clientes que no
 * pueden lanzar un proceso local (claude.ai web, conectores remotos, Gemini
 * vía URL, etc.). Pensado para correr detrás de un túnel (Cloudflare Tunnel,
 * ngrok...) o desplegado en un PaaS con HTTPS.
 *
 * Multiusuario: cada usuario tiene su propio token de acceso y su propio token
 * M2M de iagestión (cifrado en reposo, ver src/users.ts). El token de acceso
 * identifica al usuario y, con él, qué token de iagestión se usa en sus
 * llamadas (viaja en un AsyncLocalStorage, ver src/requestContext.ts). Las altas
 * y bajas se hacen con el CLI src/admin.ts, sin reiniciar el servidor.
 *
 * Seguridad:
 *  - Token M2M de iagestión: se queda en el servidor, nunca lo ve el cliente MCP.
 *  - Token de acceso por usuario: se exige en la URL (/mcp/<token>) porque
 *    muchos clientes de conector remoto solo permiten pegar una URL, sin poder
 *    añadir cabeceras personalizadas. También se acepta como
 *    `Authorization: Bearer <token>` en /mcp (sin token en la ruta), que evita
 *    dejar el secreto en los logs de acceso del proxy. Sin ningún usuario ni
 *    MCP_ACCESS_TOKEN, nadie entra: exponer este servicio sin secreto propio
 *    dejaría el CRM completo (lectura y escritura) abierto a quien tenga la URL.
 *  - MCP_ACCESS_TOKEN (opcional, modo heredado de un solo usuario): si está
 *    definido sigue funcionando y usa IAGESTION_API_TOKEN del entorno.
 *  - Rate limiting: máx. RATE_LIMIT_MAX peticiones/minuto por usuario
 *    (ver checkRateLimit). Devuelve HTTP 429 con Retry-After.
 *  - Freno a acciones destructivas: más de DESTRUCTIVE_THRESHOLD llamadas a
 *    tools de actualizar/eliminar/desvincular/publicar-despublicar/gestionar
 *    lead en DESTRUCTIVE_WINDOW_MS (por usuario) exigen `confirmacion_humana` en los
 *    argumentos de la tool, igual al secreto IAGESTION_CONFIRM_TOKEN — así
 *    una cadena de modificaciones/borrados no puede ejecutarse sin que un
 *    humano (no el LLM) facilite ese token de aprobación. Interceptado a
 *    nivel de transporte, antes de que la petición llegue a ninguna tool: no
 *    requiere tocar los 45 esquemas Zod individuales. Solo aplica a este
 *    transporte HTTP (la superficie remota/expuesta); el stdio local
 *    (Claude Desktop/Code) ya corre bajo control directo del usuario.
 *    IAGESTION_CONFIRM_TOKEN es un secreto estático PROVISIONAL: el diseño
 *    para sustituirlo por un token dinámico de un solo uso, con caducidad y
 *    envío por WhatsApp/email, está en docs/confirmacion-humana-dinamica.md
 *    (pendiente de implementar).
 *
 * Modo stateless: cada petición POST /mcp/<token> crea un McpServer y un
 * StreamableHTTPServerTransport efímeros (ver ejemplo oficial del SDK
 * `simpleStatelessStreamableHttp`). No hay sesiones MCP ni resumibilidad SSE;
 * el rate limiting y el freno de acciones destructivas llevan su propio
 * estado en memoria del proceso, en los Map de más abajo.
 */

import { randomUUID, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createIagestionServer } from "./mcpServer.js";
import { runWithUser, type UserContext } from "./requestContext.js";
import { countUsers, decryptApiToken, findUserByAccessToken, USERS_FILE } from "./users.js";

const PORT = Number(process.env.PORT ?? 3000);
const ACCESS_TOKEN = process.env.MCP_ACCESS_TOKEN;
const CONFIRM_TOKEN = process.env.IAGESTION_CONFIRM_TOKEN;

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto

const DESTRUCTIVE_THRESHOLD = 5;
const DESTRUCTIVE_WINDOW_MS = 10 * 60_000; // 10 minutos

// Tools que modifican o destruyen datos ya existentes (no altas: crear un
// registro nuevo es de bajo riesgo comparado con pisar o borrar uno que ya
// existía, que es justo lo que estas notas piden frenar).
const DESTRUCTIVE_TOOLS = new Set([
  "iagestion_actualizar_inmueble",
  "iagestion_eliminar_inmueble",
  "iagestion_actualizar_contacto",
  "iagestion_eliminar_contacto",
  "iagestion_actualizar_demanda",
  "iagestion_eliminar_demanda",
  "iagestion_actualizar_gestion",
  "iagestion_eliminar_gestion",
  "iagestion_actualizar_agente",
  "iagestion_eliminar_agente",
  "iagestion_desvincular_propietario",
  "iagestion_actualizar_prospecto",
  "iagestion_eliminar_prospecto",
  "iagestion_publicar_despublicar_inmueble",
  "iagestion_gestionar_lead",
]);

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return nodeTimingSafeEqual(bufA, bufB);
}

type AuthResult =
  | { ok: true; user: UserContext }
  | { ok: false; status: 401 | 500; code: number; message: string };

/**
 * Identifica al usuario por el token de la URL o por `Authorization: Bearer`.
 * Los tokens de usuario se buscan por su hash SHA-256 (el token en claro no se
 * guarda), así que la búsqueda no depende de comparar cadenas con el secreto.
 */
function authenticate(req: { params: Record<string, string | undefined>; headers: Record<string, unknown> }): AuthResult {
  const candidates: string[] = [];
  if (req.params.token) candidates.push(req.params.token);
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    candidates.push(authHeader.slice("Bearer ".length));
  }

  for (const candidate of candidates) {
    const record = findUserByAccessToken(candidate);
    if (record) {
      try {
        return {
          ok: true,
          user: { userId: record.id, nombre: record.nombre, apiToken: decryptApiToken(record.apiTokenEnc) },
        };
      } catch (error) {
        // Clave de cifrado incorrecta o fichero alterado. Nunca se cae al token de otro usuario.
        console.error(`[iagestion-mcp-http] No se pudo descifrar el token de iagestión del usuario ${record.id}:`, error);
        return { ok: false, status: 500, code: -32603, message: "Error interno del servidor." };
      }
    }

    if (ACCESS_TOKEN && timingSafeEqual(candidate, ACCESS_TOKEN)) {
      return {
        ok: true,
        user: { userId: "legacy", nombre: "(token único)", apiToken: process.env.IAGESTION_API_TOKEN },
      };
    }
  }

  return { ok: false, status: 401, code: -32001, message: "No autorizado: token de acceso inválido o ausente." };
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Rate limiting: ventana fija de RATE_LIMIT_WINDOW_MS por usuario.
// ---------------------------------------------------------------------------

const rateLimitState = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const state = rateLimitState.get(userId);
  if (!state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(userId, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (state.count >= RATE_LIMIT_MAX) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - state.windowStart);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  state.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Freno a acciones destructivas: ventana fija de DESTRUCTIVE_WINDOW_MS por
// usuario. Al superar el umbral, cada llamada destructiva adicional
// exige confirmacion_humana === IAGESTION_CONFIRM_TOKEN en sus argumentos.
// ---------------------------------------------------------------------------

const destructiveState = new Map<string, { count: number; windowStart: number }>();

function registerDestructiveCall(userId: string): { count: number } {
  const now = Date.now();
  const state = destructiveState.get(userId);
  if (!state || now - state.windowStart >= DESTRUCTIVE_WINDOW_MS) {
    const fresh = { count: 1, windowStart: now };
    destructiveState.set(userId, fresh);
    return { count: fresh.count };
  }
  state.count += 1;
  return { count: state.count };
}

/** Con muchos usuarios los Map crecerían sin límite: se purgan las ventanas ya caducadas. */
function pruneExpiredWindows(): void {
  const now = Date.now();
  for (const [key, s] of rateLimitState) if (now - s.windowStart >= RATE_LIMIT_WINDOW_MS) rateLimitState.delete(key);
  for (const [key, s] of destructiveState) if (now - s.windowStart >= DESTRUCTIVE_WINDOW_MS) destructiveState.delete(key);
}

interface JsonRpcCallBody {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

/**
 * Inspecciona (y, si hace falta, modifica in-place) el body de una petición
 * tools/call antes de reenviarla al SDK. Devuelve un error MCP si debe
 * bloquearse; si no, deja el body listo para transport.handleRequest().
 *
 * Nota: solo entiende una petición JSON-RPC individual (el caso real de
 * cualquier cliente MCP habitual). Un batch (array) se deja pasar sin
 * inspeccionar — no hay evidencia de que ningún cliente actual los use para
 * tools/call.
 */
function guardDestructiveCall(
  body: unknown,
  userId: string
): { blocked: false } | { blocked: true; error: ReturnType<typeof jsonRpcError> } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { blocked: false };
  const call = body as JsonRpcCallBody;
  if (call.method !== "tools/call") return { blocked: false };

  const toolName = call.params?.name;
  if (!toolName || !DESTRUCTIVE_TOOLS.has(toolName)) return { blocked: false };

  const args = call.params?.arguments;
  const providedConfirmation = typeof args?.confirmacion_humana === "string" ? args.confirmacion_humana : undefined;
  // Se quita siempre del payload antes de seguir: ninguna tool declara este
  // campo en su esquema Zod (additionalProperties:false lo rechazaría).
  if (args && "confirmacion_humana" in args) delete args.confirmacion_humana;

  const { count } = registerDestructiveCall(userId);

  if (count <= DESTRUCTIVE_THRESHOLD) {
    return { blocked: false };
  }

  if (CONFIRM_TOKEN && providedConfirmation && timingSafeEqual(providedConfirmation, CONFIRM_TOKEN)) {
    return { blocked: false };
  }

  const detalle = CONFIRM_TOKEN
    ? `Añade "confirmacion_humana": "<el token que te dé la persona que lo gestiona>" en los argumentos de la tool.`
    : `El servidor no tiene configurado IAGESTION_CONFIRM_TOKEN, así que ninguna acción destructiva adicional puede aprobarse hasta que se configure.`;

  return {
    blocked: true,
    error: jsonRpcError(
      call.id,
      -32010,
      `Se han detectado ${count} llamadas a "${toolName}" u otras tools de actualizar/eliminar en los últimos ` +
        `${DESTRUCTIVE_WINDOW_MS / 60_000} minutos (límite: ${DESTRUCTIVE_THRESHOLD}). Por seguridad se requiere ` +
        `confirmación humana explícita antes de seguir modificando o borrando datos. ${detalle}`
    ),
  };
}

async function main(): Promise<void> {
  if (!ACCESS_TOKEN && !process.env.USERS_ENCRYPTION_KEY) {
    console.error(
      "[iagestion-mcp-http] Falta configuración de acceso. Define USERS_ENCRYPTION_KEY (modo multiusuario, " +
        "recomendado; los usuarios se dan de alta con `node dist/admin.js add`) o MCP_ACCESS_TOKEN (modo de " +
        "un solo usuario). El servidor no arranca sin ninguno para no exponer el CRM sin protección."
    );
    process.exit(1);
  }

  if (process.env.USERS_ENCRYPTION_KEY) {
    const users = countUsers();
    console.error(`[iagestion-mcp-http] Modo multiusuario: ${users} usuario(s) en ${USERS_FILE}.`);
    if (users === 0 && !ACCESS_TOKEN) {
      console.error("[iagestion-mcp-http] Aviso: aún no hay usuarios; nadie podrá conectar hasta el primer `admin add`.");
    }
  }

  if (ACCESS_TOKEN && !process.env.IAGESTION_API_TOKEN) {
    console.error(
      "[iagestion-mcp-http] Aviso: IAGESTION_API_TOKEN no está definida. " +
        "Las llamadas con MCP_ACCESS_TOKEN (modo de un solo usuario) fallarán hasta que se configure."
    );
  }

  if (!CONFIRM_TOKEN) {
    console.error(
      "[iagestion-mcp-http] Aviso: IAGESTION_CONFIRM_TOKEN no está definida. Tras " +
        `${DESTRUCTIVE_THRESHOLD} acciones destructivas (actualizar/eliminar/...) en ${DESTRUCTIVE_WINDOW_MS / 60_000} ` +
        "minutos, TODAS las siguientes quedarán bloqueadas sin posibilidad de confirmación hasta que se configure."
    );
  }

  // host: '0.0.0.0' porque detrás de un túnel el Host header entrante es el
  // hostname público del túnel (cambia cada vez), no localhost. La protección
  // real la da el token de acceso exigido en authenticate(), no el Host header.
  const app = createMcpExpressApp({ host: "0.0.0.0" });

  setInterval(pruneExpiredWindows, 5 * 60_000).unref();

  // Dos formas de llegar: /mcp/<token> (token en la URL) y /mcp (token en Authorization: Bearer).
  app.post(["/mcp", "/mcp/:token"], async (req, res) => {
    const auth = authenticate(req);
    if (!auth.ok) {
      res.status(auth.status).json(jsonRpcError(req.body?.id, auth.code, auth.message));
      return;
    }
    const { user } = auth;

    const rate = checkRateLimit(user.userId);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      res
        .status(429)
        .json(
          jsonRpcError(
            req.body?.id,
            -32029,
            `Límite de ${RATE_LIMIT_MAX} peticiones/minuto superado. Vuelve a intentarlo en ${rate.retryAfterSeconds} segundos.`
          )
        );
      return;
    }

    const guard = guardDestructiveCall(req.body, user.userId);
    if (guard.blocked) {
      res.status(403).json(guard.error);
      return;
    }

    // Rastro de auditoría: quién llama a qué tool (nunca se registra ningún token).
    if (req.body?.method === "tools/call") {
      console.error(`[iagestion-mcp-http] usuario=${user.nombre} (${user.userId}) tool=${req.body?.params?.name}`);
    }

    const server = createIagestionServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      // El contexto de usuario debe abrirse antes de conectar y de gestionar la
      // petición: es lo que hace que las tools usen el token de iagestión de ESTE usuario.
      await runWithUser(user, async () => {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error("[iagestion-mcp-http] Error gestionando petición MCP:", error);
      if (!res.headersSent) {
        res.status(500).json(jsonRpcError(req.body?.id, -32603, "Error interno del servidor."));
      }
    }
  });

  // Modo stateless: no hay stream SSE persistente (GET) ni sesiones que cerrar (DELETE).
  app.get(["/mcp", "/mcp/:token"], (_req, res) => {
    res.status(405).json(jsonRpcError(null, -32000, "Method not allowed (servidor en modo stateless)."));
  });
  app.delete(["/mcp", "/mcp/:token"], (_req, res) => {
    res.status(405).json(jsonRpcError(null, -32000, "Method not allowed (servidor en modo stateless)."));
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "iagestion-mcp", requestId: randomUUID() });
  });

  app.listen(PORT, () => {
    console.error(`[iagestion-mcp-http] Escuchando en http://localhost:${PORT}`);
    console.error(`[iagestion-mcp-http] Endpoint MCP: POST http://localhost:${PORT}/mcp/<token_de_acceso> (o /mcp con Authorization: Bearer)`);
    console.error(
      `[iagestion-mcp-http] Rate limit: ${RATE_LIMIT_MAX}/min · Freno destructivo: ${DESTRUCTIVE_THRESHOLD} acciones / ${DESTRUCTIVE_WINDOW_MS / 60_000} min`
    );
  });
}

main().catch((error) => {
  console.error("[iagestion-mcp-http] Error fatal al iniciar el servidor:", error);
  process.exit(1);
});
