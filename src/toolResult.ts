/**
 * Helpers para convertir el resultado (o error) de una llamada a iagestión
 * en la forma de respuesta que espera el protocolo MCP.
 */

import { IagestionApiError } from "./client.js";

export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Éxito: serializa el JSON de respuesta en un bloque de texto legible. */
export function ok(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/** Error: normaliza cualquier excepción a un texto legible con isError: true. */
export function fail(error: unknown): McpToolResult {
  let message: string;
  if (error instanceof IagestionApiError) {
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  return {
    content: [
      {
        type: "text",
        text: `❌ ${message}`,
      },
    ],
    isError: true,
  };
}

/** Envuelve un handler de tool para capturar errores y devolver siempre un McpToolResult válido. */
export function withErrorHandling<Args>(
  handler: (args: Args) => Promise<unknown>
): (args: Args) => Promise<McpToolResult> {
  return async (args: Args) => {
    try {
      const data = await handler(args);
      return ok(data);
    } catch (error) {
      return fail(error);
    }
  };
}
