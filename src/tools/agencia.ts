/**
 * Tools MCP para datos de la propia inmobiliaria/agencia en iagestión:
 *   - iagestion_listar_inmobiliarias -> POST /inmobiliarias/
 *   - iagestion_obtener_agencia      -> POST /agencia/
 *
 * Ninguno de los dos servicios admite parámetros: la agrupación (agencia
 * única, o todo el grupo si el login/token pertenece a un MLS) se determina
 * automáticamente por las credenciales.
 *
 * IMPORTANTE: /agencia/ devuelve la fila de configuración interna completa
 * de la agencia, que incluye credenciales de integraciones de terceros en
 * texto plano (Mailjet, Fotocasa, centralita, certificado de firma
 * digital...). Ambas tools pasan la respuesta por redactSensitiveFields()
 * antes de devolverla — esas claves NUNCA deben llegar al cliente MCP.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";
import { redactSensitiveFields } from "../redact.js";

const sinParametrosShape = {};
type SinParametrosArgs = z.infer<z.ZodObject<typeof sinParametrosShape>>;

export function registerAgenciaTools(server: McpServer): void {
  server.registerTool(
    "iagestion_listar_inmobiliarias",
    {
      title: "Listar inmobiliarias en iagestión",
      description:
        "Agencias visibles para la credencial usada en el CRM iagestión: una única agencia, o todo el grupo " +
        "si el token pertenece a una agrupación MLS. No admite parámetros. Los campos sensibles (claves de " +
        "API, contraseñas, tokens) se censuran antes de devolver la respuesta. Servicio: POST /inmobiliarias/.",
      inputSchema: sinParametrosShape,
    },
    withErrorHandling<SinParametrosArgs>(async () => {
      const data = await callIagestion("inmobiliarias", {});
      return redactSensitiveFields(data);
    })
  );

  server.registerTool(
    "iagestion_obtener_agencia",
    {
      title: "Ficha de la agencia autenticada en iagestión",
      description:
        "Configuración de la agencia autenticada (o de la agencia resuelta por MLS) en el CRM iagestión: " +
        "branding, licencias contratadas, franja horaria, idiomas activos, etc. No admite parámetros. Los " +
        "campos sensibles (claves de API, contraseñas, tokens de integraciones con Mailjet, Fotocasa, " +
        "centralita, certificado de firma digital...) se censuran antes de devolver la respuesta — nunca se " +
        "exponen al cliente MCP. Servicio: POST /agencia/.",
      inputSchema: sinParametrosShape,
    },
    withErrorHandling<SinParametrosArgs>(async () => {
      const data = await callIagestion("agencia", {});
      return redactSensitiveFields(data);
    })
  );
}
