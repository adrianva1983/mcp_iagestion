/**
 * Tool MCP de administración de la cuenta en iagestión:
 *   - iagestion_solicitar_ampliacion_licencia -> POST /solicitar_licencia/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const sinParametrosShape = {};
type SinParametrosArgs = z.infer<z.ZodObject<typeof sinParametrosShape>>;

export function registerLicenciasTools(server: McpServer): void {
  server.registerTool(
    "iagestion_solicitar_ampliacion_licencia",
    {
      title: "Solicitar ampliación de licencias en iagestión",
      description:
        "Registra ante el equipo de soporte de iagestión una solicitud de ampliación de licencias de usuario " +
        "para la agencia autenticada. No admite parámetros. Servicio: POST /solicitar_licencia/.",
      inputSchema: sinParametrosShape,
    },
    withErrorHandling<SinParametrosArgs>(async () => callIagestion("solicitar_licencia", {}))
  );
}
