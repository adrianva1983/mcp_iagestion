#!/usr/bin/env node
/**
 * iagestion-mcp (stdio)
 *
 * Entrypoint para clientes MCP nativos que lanzan un proceso local: Claude
 * Desktop y Claude Code. Transporte: StdioServerTransport.
 *
 * Para exponer el mismo servidor como servicio remoto (claude.ai web,
 * Gemini CLI vía HTTP, etc.) usa src/httpServer.ts en su lugar.
 *
 * Autenticación contra iagestión: token M2M Bearer leído de la variable
 * de entorno IAGESTION_API_TOKEN (ver src/client.ts).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createIagestionServer } from "./mcpServer.js";

async function main(): Promise<void> {
  if (!process.env.IAGESTION_API_TOKEN) {
    // No abortamos el arranque: el error se reportará de forma legible al
    // invocar cualquier tool (ver client.ts), pero avisamos por stderr para
    // facilitar el diagnóstico al integrar el servidor.
    console.error(
      "[iagestion-mcp] Aviso: IAGESTION_API_TOKEN no está definida. " +
        "Las llamadas a la API fallarán hasta que se configure el token M2M."
    );
  }

  const server = createIagestionServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[iagestion-mcp] Servidor MCP iniciado (stdio).");
}

main().catch((error) => {
  console.error("[iagestion-mcp] Error fatal al iniciar el servidor:", error);
  process.exit(1);
});
