/**
 * Tool MCP para operaciones de venta y alquiler cerradas por la agencia
 * (precio, partes, comisiones, honorarios, financiación y datos del contrato):
 *   - iagestion_buscar_operaciones -> POST /operacion/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const buscarOperacionesShape = {
  Id: z.number().int().positive().optional().describe("Una operación concreta."),
  IdInmueble: z.number().int().positive().optional().describe("Operaciones de ese inmueble."),
  IdDemanda: z.number().int().positive().optional().describe("Operaciones de esa demanda."),
  FechaSync: z
    .string()
    .optional()
    .describe(
      "Para sincronizar: solo operaciones registradas desde esa fecha (campo Fecha, incluida). " +
        "AAAA-MM-DD o DD/MM/AAAA, con hora opcional. Los cambios posteriores en una operación ya registrada no se detectan."
    ),
  limit: z.number().int().positive().optional().describe("Operaciones por página. Sin límite, se devuelven todas."),
  pagina: z.number().int().positive().optional().describe("Empieza en 1. Solo tiene efecto junto a limit."),
};
const buscarOperacionesSchema = z.object(buscarOperacionesShape);
type BuscarOperacionesArgs = z.infer<typeof buscarOperacionesSchema>;

export function registerOperacionesTools(server: McpServer): void {
  server.registerTool(
    "iagestion_buscar_operaciones",
    {
      title: "Buscar operaciones cerradas en iagestión",
      description:
        "Consulta las operaciones de venta y alquiler cerradas por la agencia (precio, partes, comisiones, " +
        "honorarios, financiación y datos del contrato), de la más reciente a la más antigua. Siempre limitado " +
        "a la agencia autenticada; sin filtros devuelve todas. Servicio: POST /operacion/.",
      inputSchema: buscarOperacionesShape,
    },
    withErrorHandling<BuscarOperacionesArgs>(async (args) => callIagestion("operacion", args))
  );
}
