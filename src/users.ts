/**
 * Almacén de usuarios del transporte HTTP multiusuario.
 *
 * Cada usuario tiene:
 *  - un token de acceso propio (el que va en la URL /mcp/<token> o en
 *    `Authorization: Bearer`). Solo se guarda su hash SHA-256: el token en claro
 *    se muestra una única vez al crearlo (ver src/admin.ts).
 *  - su token M2M de iagestión, cifrado en reposo con AES-256-GCM usando
 *    USERS_ENCRYPTION_KEY. Sin esa clave el fichero no sirve de nada.
 *
 * El fichero (USERS_FILE, por defecto ./data/users.json) lo escribe solo el CLI
 * de administración; el servidor únicamente lo lee y lo recarga cuando cambia
 * su fecha de modificación, así que dar de alta o de baja a alguien no obliga
 * a reiniciar.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface UserRecord {
  id: string;
  nombre: string;
  /** SHA-256 (hex) del token de acceso. */
  accessHash: string;
  /** Token M2M de iagestión cifrado: v1.<iv>.<tag>.<datos> (base64url). */
  apiTokenEnc: string;
  createdAt: string;
}

interface StoreFile {
  version: 1;
  users: UserRecord[];
}

export const USERS_FILE = process.env.USERS_FILE ?? path.resolve("data", "users.json");

const RELOAD_CHECK_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// Cifrado del token de iagestión
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer {
  const raw = process.env.USERS_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "USERS_ENCRYPTION_KEY no está definida o es demasiado corta (mínimo 32 caracteres). " +
        'Genera una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
    );
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptApiToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptApiToken(enc: string): string {
  const [version, iv, tag, data] = enc.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de token cifrado no válido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Tokens de acceso
// ---------------------------------------------------------------------------

export function generateAccessToken(): string {
  return `imcp_${randomBytes(32).toString("base64url")}`;
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// Lectura / escritura del fichero
// ---------------------------------------------------------------------------

export function readStore(): StoreFile {
  if (!existsSync(USERS_FILE)) return { version: 1, users: [] };
  const parsed = JSON.parse(readFileSync(USERS_FILE, "utf8")) as StoreFile;
  if (parsed.version !== 1 || !Array.isArray(parsed.users)) {
    throw new Error(`Formato no reconocido en ${USERS_FILE}.`);
  }
  return parsed;
}

/** Escritura atómica (tmp + rename) y con permisos restringidos. */
export function writeStore(store: StoreFile): void {
  mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  const tmp = `${USERS_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(tmp, USERS_FILE);
  try {
    chmodSync(USERS_FILE, 0o600);
  } catch {
    // En Windows chmod apenas tiene efecto; no es un error.
  }
}

// ---------------------------------------------------------------------------
// Consulta desde el servidor (con recarga automática)
// ---------------------------------------------------------------------------

let byHash = new Map<string, UserRecord>();
let loadedMtimeMs = -1;
let lastCheck = 0;

function refreshIfChanged(): void {
  const now = Date.now();
  if (now - lastCheck < RELOAD_CHECK_INTERVAL_MS) return;
  lastCheck = now;

  const mtime = existsSync(USERS_FILE) ? statSync(USERS_FILE).mtimeMs : 0;
  if (mtime === loadedMtimeMs) return;

  try {
    byHash = new Map(readStore().users.map((u) => [u.accessHash, u]));
    loadedMtimeMs = mtime;
  } catch (error) {
    // Si el fichero está a medias o corrupto se conserva la última versión buena.
    console.error("[iagestion-mcp-http] No se pudo recargar el fichero de usuarios:", error);
  }
}

export function countUsers(): number {
  lastCheck = 0;
  refreshIfChanged();
  return byHash.size;
}

/** Devuelve el usuario dueño de ese token de acceso, o undefined si no existe. */
export function findUserByAccessToken(token: string): UserRecord | undefined {
  refreshIfChanged();
  return byHash.get(hashAccessToken(token));
}
