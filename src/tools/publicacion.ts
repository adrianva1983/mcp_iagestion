/**
 * Tools MCP para la publicación de inmuebles en portales inmobiliarios (Idealista,
 * Fotocasa, pisos.com...) desde iagestión:
 *   - iagestion_listar_portales_publicacion    -> POST /publicacion_portales/
 *   - iagestion_consultar_publicacion_inmueble -> POST /publicacion_inmueble/
 *   - iagestion_publicar_despublicar_inmueble  -> POST /publicacion_inmueble_activar/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const sinParametrosShape = {};
type SinParametrosArgs = z.infer<z.ZodObject<typeof sinParametrosShape>>;

const consultarPublicacionShape = {
  Id_Inmueble: z.number().int().positive().optional(),
  Id_Portal: z.number().int().positive().optional(),
  Nombre_Portal: z.string().optional().describe("Coincidencia parcial."),
};
type ConsultarPublicacionArgs = z.infer<z.ZodObject<typeof consultarPublicacionShape>>;

const publicarDespublicarShape = {
  Id_Inmueble: z.number().int().positive(),
  Id_Portal: z.number().int().positive().optional().describe("Uno de Id_Portal/Nombre_Portal."),
  Nombre_Portal: z.string().optional().describe("Uno de Id_Portal/Nombre_Portal."),
  Publicar: z.union([z.literal(1), z.literal(0)]).describe("1 = publicar, 0 = despublicar."),
};
const publicarDespublicarSchema = z
  .object(publicarDespublicarShape)
  .refine((v) => v.Id_Portal !== undefined || (v.Nombre_Portal !== undefined && v.Nombre_Portal !== ""), {
    message: "Debes indicar Id_Portal o Nombre_Portal (al menos uno).",
  });
type PublicarDespublicarArgs = z.infer<typeof publicarDespublicarSchema>;

export function registerPublicacionTools(server: McpServer): void {
  server.registerTool(
    "iagestion_listar_portales_publicacion",
    {
      title: "Portales de publicación activos en iagestión",
      description:
        "Portales inmobiliarios contratados y con la pasarela de envío activada para la agencia. No admite " +
        "parámetros. Servicio: POST /publicacion_portales/.",
      inputSchema: sinParametrosShape,
    },
    withErrorHandling<SinParametrosArgs>(async () => callIagestion("publicacion_portales", {}))
  );

  server.registerTool(
    "iagestion_consultar_publicacion_inmueble",
    {
      title: "Estado de publicación de un inmueble en portales",
      description:
        "Por qué portales está marcado un inmueble, con histórico de envíos: fecha de publicación/" +
        "actualización, enlace público y errores de la última sincronización. Servicio: POST /publicacion_inmueble/.",
      inputSchema: consultarPublicacionShape,
    },
    withErrorHandling<ConsultarPublicacionArgs>(async (args) => callIagestion("publicacion_inmueble", args))
  );

  server.registerTool(
    "iagestion_publicar_despublicar_inmueble",
    {
      title: "Publicar o despublicar un inmueble en un portal",
      description:
        "Marca un inmueble para publicar o retirar de un portal concreto (Idealista, Fotocasa...). Solo se " +
        'puede publicar (Publicar=1) un inmueble en Estado "Disponible" — en cualquier otro estado la API ' +
        "responde error. Despublicar siempre es posible y es idempotente. Servicio: POST /publicacion_inmueble_activar/.",
      inputSchema: publicarDespublicarShape,
    },
    withErrorHandling<PublicarDespublicarArgs>(async (args) => {
      const parsed = publicarDespublicarSchema.parse(args);
      return callIagestion("publicacion_inmueble_activar", parsed);
    })
  );
}
