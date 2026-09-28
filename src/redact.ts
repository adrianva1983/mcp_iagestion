/**
 * Censura campos sensibles (claves de API, contraseñas, tokens, secretos de
 * integraciones de terceros...) antes de devolver una respuesta de iagestión
 * a un cliente MCP.
 *
 * Necesario porque algunos servicios (p. ej. /agencia/) devuelven la fila de
 * configuración interna completa de la agencia, que incluye credenciales de
 * integraciones embebidas en texto plano: Mailjet, Fotocasa, centralita,
 * certificado de firma digital, etc. Esos valores nunca deben salir del
 * servidor hacia el cliente MCP.
 */

// Cualquier clave que contenga alguno de estos fragmentos (sin distinguir
// mayúsculas/minúsculas) se censura, sea cual sea su posición en el objeto.
const SENSITIVE_KEY_PATTERN = /pass|secret|apikey|api_key|token/i;

const REDACTED = "[REDACTADO — campo sensible omitido por seguridad]";

/** Recorre recursivamente arrays/objetos y sustituye el valor de cualquier
 * clave sensible por un marcador, dejando el resto de la estructura intacta. */
export function redactSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSensitiveFields(val);
    }
    return out as T;
  }
  return value;
}
