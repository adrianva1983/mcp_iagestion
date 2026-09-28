/**
 * Tools MCP para la vinculación propietario↔inmueble en iagestión:
 *   - iagestion_consultar_propietarios -> POST /consultar_propietarios/
 *   - iagestion_vincular_propietario   -> POST /actualizar_propietarios/
 *   - iagestion_desvincular_propietario -> POST /eliminar_propietarios/
 *
 * La relación se guarda con fecha de alta y baja, conservando el histórico completo.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const consultarPropietariosShape = {
  Id_inmueble: z.number().int().positive().describe("Id del inmueble."),
};
type ConsultarPropietariosArgs = z.infer<z.ZodObject<typeof consultarPropietariosShape>>;

const vincularPropietarioShape = {
  Id_Inmueble: z.number().int().positive(),
  Id_Contacto: z.number().int().positive().describe("Contacto que se vincula como propietario."),
};
type VincularPropietarioArgs = z.infer<z.ZodObject<typeof vincularPropietarioShape>>;

const desvincularPropietarioShape = {
  Id_Inmueble: z.number().int().positive(),
  Id_Contacto: z.number().int().positive(),
};
type DesvincularPropietarioArgs = z.infer<z.ZodObject<typeof desvincularPropietarioShape>>;

export function registerPropietariosTools(server: McpServer): void {
  server.registerTool(
    "iagestion_consultar_propietarios",
    {
      title: "Propietarios de un inmueble en iagestión",
      description:
        "Devuelve los contactos actualmente vinculados a un inmueble como propietarios (relación activa, sin " +
        "fecha de desvinculación). Servicio: POST /consultar_propietarios/.",
      inputSchema: consultarPropietariosShape,
    },
    withErrorHandling<ConsultarPropietariosArgs>(async (args) => callIagestion("consultar_propietarios", args))
  );

  server.registerTool(
    "iagestion_vincular_propietario",
    {
      title: "Vincular un propietario a un inmueble en iagestión",
      description:
        "Crea la relación propietario↔inmueble. Es idempotente: si la relación ya existe, no la duplica. " +
        "Servicio: POST /actualizar_propietarios/.",
      inputSchema: vincularPropietarioShape,
    },
    withErrorHandling<VincularPropietarioArgs>(async (args) => callIagestion("actualizar_propietarios", args))
  );

  server.registerTool(
    "iagestion_desvincular_propietario",
    {
      title: "Desvincular un propietario de un inmueble en iagestión",
      description:
        "Marca la fecha de desvinculación de la relación propietario↔inmueble (no la borra). " +
        "Servicio: POST /eliminar_propietarios/.",
      inputSchema: desvincularPropietarioShape,
    },
    withErrorHandling<DesvincularPropietarioArgs>(async (args) => callIagestion("eliminar_propietarios", args))
  );
}
