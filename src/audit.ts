/**
 * Registro de auditoría: qué usuario ha llamado a qué tool y cuándo. Vive
 * aparte de los logs de Docker (que rotan y no están pensados para
 * consultarse) para que el panel de administración pueda leerlo. Nunca se
 * anota ningún token ni ningún argumento de la llamada, solo el nombre de la
 * tool — igual que la línea de log que ya se escribía en httpServer.ts.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const AUDIT_FILE = process.env.AUDIT_FILE ?? path.resolve("data", "audit.jsonl");

// Recorta el fichero cuando supera este número de líneas, para que no crezca sin límite.
const MAX_LINES = Number(process.env.AUDIT_MAX_LINES ?? 5000);

export interface AuditEntry {
  ts: string;
  userId: string;
  nombre: string;
  tool: string;
}

let appendsSinceTrim = 0;

export function logCall(userId: string, nombre: string, tool: string): void {
  try {
    mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    const entry: AuditEntry = { ts: new Date().toISOString(), userId, nombre, tool };
    appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`);
    appendsSinceTrim += 1;
    if (appendsSinceTrim >= 200) {
      appendsSinceTrim = 0;
      trimIfNeeded();
    }
  } catch (error) {
    console.error("[iagestion-mcp] No se pudo escribir el registro de auditoría:", error);
  }
}

function trimIfNeeded(): void {
  try {
    if (!existsSync(AUDIT_FILE)) return;
    const lines = readFileSync(AUDIT_FILE, "utf8").split("\n").filter(Boolean);
    if (lines.length <= MAX_LINES) return;
    const kept = lines.slice(-MAX_LINES);
    const tmp = `${AUDIT_FILE}.tmp`;
    writeFileSync(tmp, `${kept.join("\n")}\n`);
    renameSync(tmp, AUDIT_FILE);
  } catch (error) {
    console.error("[iagestion-mcp] No se pudo recortar el registro de auditoría:", error);
  }
}

/**
 * Las `limit` entradas más recientes, más nuevas primero, filtradas por usuario y/o por fecha
 * (`sinceMs`, epoch ms) si se indican. El fichero se escribe siempre en orden cronológico
 * (append-only), así que al recorrerlo de más nuevo a más antiguo, en cuanto una entrada es
 * anterior a `sinceMs` todas las que quedan por delante también lo son — se puede cortar ahí.
 */
export function readRecent(limit = 200, userId?: string, sinceMs?: number): AuditEntry[] {
  if (!existsSync(AUDIT_FILE)) return [];
  const lines = readFileSync(AUDIT_FILE, "utf8").split("\n").filter(Boolean);
  const out: AuditEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let entry: AuditEntry;
    try {
      entry = JSON.parse(lines[i] as string) as AuditEntry;
    } catch {
      continue; // línea corrupta (p. ej. un corte a medias): se ignora
    }
    if (sinceMs !== undefined && new Date(entry.ts).getTime() < sinceMs) break;
    if (userId && entry.userId !== userId) continue;
    out.push(entry);
  }
  return out;
}
