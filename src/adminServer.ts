/**
 * Panel de administración de usuarios: dashboard web sobre /data/users.json,
 * en un puerto Y PROCESO APARTE del servidor MCP (src/httpServer.ts), aunque
 * corren dentro del mismo contenedor.
 *
 * MUY IMPORTANTE — modelo de seguridad: este panel NO tiene login propio. Se
 * apoya por completo en que el puerto (ADMIN_PORT, por defecto 8081) se
 * publica SOLO en 127.0.0.1 del host (ver docker-compose.prod.yml). La única
 * forma de llegar hasta él desde fuera del VPS es un túnel SSH:
 *
 *   ssh -L 8081:127.0.0.1:8081 usuario@tu-vps
 *   (y abrir http://127.0.0.1:8081/admin en el navegador)
 *
 * Quien tiene acceso SSH al VPS tiene acceso al panel — decisión explícita
 * para no gestionar una contraseña más. Si esto se publica alguna vez con
 * "PUERTO:PUERTO" en vez de "127.0.0.1:PUERTO:PUERTO" (o en cualquier Caddyfile
 * público), CUALQUIERA con la URL podría dar de alta o revocar usuarios sin
 * autenticarse. Ver docs/panel-administracion.md.
 *
 * Sin CORS habilitado y sin cookies: las peticiones que cambian datos exigen
 * `Content-Type: application/json`, lo que obliga al navegador a lanzar un
 * preflight CORS que esta app nunca autoriza — protección suficiente contra
 * CSRF sin necesitar un token aparte, dado que no hay sesión que robar.
 */

import { randomBytes } from "node:crypto";
import express from "express";
import { readRecent } from "./audit.js";
import {
  defaultExpiryIso,
  encryptApiToken,
  generateAccessToken,
  hashAccessToken,
  invalidateCache,
  isExpired,
  readStore,
  writeStore,
  type UserRecord,
} from "./users.js";

const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 8081);

function publicUrlFor(token: string): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/mcp/${token}` : `/mcp/${token}`;
}

function summarize(u: UserRecord) {
  const now = Date.now();
  const diasRestantes = u.expiresAt ? Math.ceil((new Date(u.expiresAt).getTime() - now) / 86_400_000) : null;
  return {
    id: u.id,
    nombre: u.nombre,
    createdAt: u.createdAt,
    expiresAt: u.expiresAt ?? null,
    diasRestantes,
    expirado: u.expiresAt ? isExpired(u) : false,
    lastUsedAt: u.lastUsedAt,
  };
}

function parseDias(body: unknown): number | undefined | "invalid" {
  const raw = (body as Record<string, unknown> | null)?.dias;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const dias = Number(raw);
  if (!Number.isFinite(dias) || dias <= 0) return "invalid";
  return dias;
}

export function startAdminServer(): void {
  if (process.env.ADMIN_UI_ENABLED === "false") {
    console.error("[iagestion-admin] Panel desactivado (ADMIN_UI_ENABLED=false).");
    return;
  }

  const app = express();
  app.use(express.json());

  app.get("/admin", async (_req, res) => {
    const { renderAdminPage } = await import("./adminUi.js");
    res.type("html").send(renderAdminPage());
  });

  app.get("/admin/api/users", (_req, res) => {
    res.json(readStore().users.map(summarize));
  });

  app.post("/admin/api/users", (req, res) => {
    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    const apiToken = typeof req.body?.apiToken === "string" ? req.body.apiToken.trim() : "";
    const dias = parseDias(req.body);
    if (!nombre) return res.status(400).json({ error: "Falta el nombre." });
    if (!apiToken) return res.status(400).json({ error: "Falta el token M2M de iagestión." });
    if (dias === "invalid") return res.status(400).json({ error: '"dias" debe ser un número positivo.' });

    const store = readStore();
    if (store.users.some((u) => u.nombre.toLowerCase() === nombre.toLowerCase())) {
      return res.status(409).json({ error: `Ya existe un usuario llamado "${nombre}".` });
    }

    const accessToken = generateAccessToken();
    const user: UserRecord = {
      id: randomBytes(4).toString("hex"),
      nombre,
      accessHash: hashAccessToken(accessToken),
      apiTokenEnc: encryptApiToken(apiToken),
      createdAt: new Date().toISOString(),
      expiresAt: defaultExpiryIso(dias),
      lastUsedAt: null,
    };
    store.users.push(user);
    writeStore(store);
    invalidateCache();
    res.status(201).json({ ...summarize(user), accessToken, url: publicUrlFor(accessToken) });
  });

  app.post("/admin/api/users/:id/rotate", (req, res) => {
    const dias = parseDias(req.body);
    if (dias === "invalid") return res.status(400).json({ error: '"dias" debe ser un número positivo.' });

    const store = readStore();
    const user = store.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

    const accessToken = generateAccessToken();
    user.accessHash = hashAccessToken(accessToken);
    user.expiresAt = defaultExpiryIso(dias);
    writeStore(store);
    invalidateCache();
    res.json({ ...summarize(user), accessToken, url: publicUrlFor(accessToken) });
  });

  app.post("/admin/api/users/:id/set-token", (req, res) => {
    const apiToken = typeof req.body?.apiToken === "string" ? req.body.apiToken.trim() : "";
    if (!apiToken) return res.status(400).json({ error: "Falta el token M2M de iagestión." });

    const store = readStore();
    const user = store.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

    user.apiTokenEnc = encryptApiToken(apiToken);
    writeStore(store);
    invalidateCache();
    res.json(summarize(user));
  });

  app.delete("/admin/api/users/:id", (req, res) => {
    const store = readStore();
    const before = store.users.length;
    store.users = store.users.filter((u) => u.id !== req.params.id);
    if (store.users.length === before) return res.status(404).json({ error: "Usuario no encontrado." });
    writeStore(store);
    invalidateCache();
    res.status(204).end();
  });

  app.get("/admin/api/audit", (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 200) || 200, 1000);
    const userId = typeof req.query.userId === "string" && req.query.userId ? req.query.userId : undefined;
    res.json(readRecent(limit, userId));
  });

  const server = app.listen(ADMIN_PORT, "0.0.0.0", () => {
    console.error(
      `[iagestion-admin] Panel de administración en http://localhost:${ADMIN_PORT}/admin — ` +
        "publica este puerto SOLO en 127.0.0.1 (túnel SSH); nunca lo expongas en Caddy/internet."
    );
  });
  server.on("error", (error) => {
    console.error("[iagestion-admin] No se pudo arrancar el panel de administración:", error);
  });
}
