/**
 * Envío de emails transaccionales vía Resend (https://resend.com), usado
 * únicamente para el código de confirmación humana de acciones destructivas
 * (ver src/confirmations.ts). Credenciales propias del servidor MCP —
 * independientes de la integración de Mailjet que cada agencia pueda tener
 * en iagestión, para no depender de que la mantengan activa.
 */

// Solo se sobreescribe en pruebas, para apuntar a un servidor simulado.
const RESEND_API_URL = process.env.RESEND_API_URL ?? "https://api.resend.com/emails";

export class MailerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailerError";
  }
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  // onboarding@resend.dev funciona sin verificar dominio propio (útil para
  // arrancar rápido), pero para producción conviene un remitente con dominio
  // propio verificado en Resend — ver CONFIRM_EMAIL_FROM en .env.example.
  return process.env.CONFIRM_EMAIL_FROM || "iagestion-mcp@resend.dev";
}

export async function sendConfirmationEmail(to: string, code: string, toolName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new MailerError("RESEND_API_KEY no configurada.");

  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: `Código de confirmación: ${code}`,
        text:
          `Se ha pedido confirmación humana para seguir con acciones de "${toolName}" en el servidor MCP de iagestión.\n\n` +
          `Código (válido unos minutos, un solo uso): ${code}\n\n` +
          "Si no lo has pedido tú, ignora este email.",
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new MailerError(`Error de red enviando el email: ${error instanceof Error ? error.message : error}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new MailerError(`Resend respondió ${response.status}: ${body.slice(0, 300)}`);
  }
}
