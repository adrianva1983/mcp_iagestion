/**
 * Códigos de confirmación humana de un solo uso, para el freno de acciones
 * destructivas (ver src/httpServer.ts). Sustituyen, para los usuarios que
 * tienen un email de confirmación configurado, al secreto estático
 * IAGESTION_CONFIRM_TOKEN.
 *
 * Viven SOLO en memoria del proceso, nunca en disco: son de corta duración
 * (CONFIRM_TTL_MS) y perder los pendientes en un reinicio del servidor no
 * tiene coste real — solo obliga a pedir un código nuevo. Un reinicio a
 * medio uso es un evento tan raro que no justifica la complejidad de
 * persistirlos.
 *
 * Versión interina, sin tocar el backend de iagestión: guarda el estado en
 * este mismo proceso en vez de en la base de datos del CRM. El diseño
 * original (con dos servicios PHP nuevos en iagestión) sigue documentado en
 * docs/confirmacion-humana-dinamica.md como posible evolución futura.
 */

import { createHash, randomInt, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

export const CONFIRM_TTL_MS = Number(process.env.CONFIRM_TTL_MINUTOS ?? 10) * 60_000;

interface PendingConfirmation {
  codeHash: string;
  tool: string;
  createdAt: number;
  expiresAt: number;
}

const pendingByUser = new Map<string, PendingConfirmation>();

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  // 6 dígitos: cómodo de leer y teclear desde un email. La entropía más baja
  // frente a un token largo se compensa con la caducidad corta y con que
  // cada intento fallido no genera uno nuevo (ver guardDestructiveCall).
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** El código pendiente y vigente de este usuario, o undefined si no hay ninguno o ya caducó. */
export function pendingFor(userId: string): PendingConfirmation | undefined {
  const pending = pendingByUser.get(userId);
  if (!pending) return undefined;
  if (Date.now() >= pending.expiresAt) {
    pendingByUser.delete(userId);
    return undefined;
  }
  return pending;
}

/** Genera y guarda un código nuevo para este usuario. El llamante es responsable de enviarlo. */
export function issueCode(userId: string, tool: string): string {
  const code = generateCode();
  const now = Date.now();
  pendingByUser.set(userId, { codeHash: hashCode(code), tool, createdAt: now, expiresAt: now + CONFIRM_TTL_MS });
  return code;
}

/** Si `provided` coincide con el código pendiente y vigente, lo consume (un solo uso) y devuelve true. */
export function consumeIfValid(userId: string, provided: string): boolean {
  const pending = pendingFor(userId);
  if (!pending) return false;
  const a = Buffer.from(hashCode(provided));
  const b = Buffer.from(pending.codeHash);
  const valid = a.length === b.length && nodeTimingSafeEqual(a, b);
  if (valid) pendingByUser.delete(userId);
  return valid;
}
