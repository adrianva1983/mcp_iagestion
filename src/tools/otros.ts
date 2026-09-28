/**
 * Tools MCP de apoyo para apps/webs de cliente final en iagestión:
 *   - iagestion_consultar_favoritos    -> POST /favoritos/
 *   - iagestion_buscar_promociones     -> POST /promociones/
 *   - iagestion_valoracion_automatica  -> POST /valoracion_automatica/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const consultarFavoritosShape = {
  id_usuario: z.number().int().positive().describe("Id del usuario final en el CRM."),
};
type ConsultarFavoritosArgs = z.infer<z.ZodObject<typeof consultarFavoritosShape>>;

const buscarPromocionesShape = {
  id_promocion: z.number().int().positive().optional().describe("Filtra una promoción concreta."),
};
type BuscarPromocionesArgs = z.infer<z.ZodObject<typeof buscarPromocionesShape>>;

const valoracionAutomaticaShape = {
  municipio: z.string(),
  latitud: z.number(),
  longitud: z.number(),
  tipo: z.string(),
  operacion: z.enum(["Venta", "Alquiler"]),
  metros: z.number().nonnegative().optional().describe("Si se indica, calcula el precio total estimado (± 5%)."),
  solo_los_mios: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe("Restringe la estimación de cruces potenciales a demandas propias."),
};
const valoracionAutomaticaSchema = z.object(valoracionAutomaticaShape);
type ValoracionAutomaticaArgs = z.infer<typeof valoracionAutomaticaSchema>;

export function registerOtrosTools(server: McpServer): void {
  server.registerTool(
    "iagestion_consultar_favoritos",
    {
      title: "Favoritos de un usuario final en iagestión",
      description:
        "Lista de inmuebles marcados como favoritos por un usuario de app o web (perfil final, no agente). " +
        "Servicio: POST /favoritos/.",
      inputSchema: consultarFavoritosShape,
    },
    withErrorHandling<ConsultarFavoritosArgs>(async (args) => callIagestion("favoritos", args))
  );

  server.registerTool(
    "iagestion_buscar_promociones",
    {
      title: "Promociones de obra nueva en iagestión",
      description:
        "Promociones activas y publicadas en web de la agencia, con calidades, multimedia y viviendas " +
        "asociadas. Servicio: POST /promociones/.",
      inputSchema: buscarPromocionesShape,
    },
    withErrorHandling<BuscarPromocionesArgs>(async (args) => callIagestion("promociones", args))
  );

  server.registerTool(
    "iagestion_valoracion_automatica",
    {
      title: "Valoración automática de un inmueble en iagestión",
      description:
        "Estima el precio por m² combinando transacciones reales de los últimos 12 meses (vendido/alquilado) " +
        "con oferta actual en la misma zona. Con suficiente histórico pondera 70% histórico/30% mercado; con " +
        "poco, 50/50; si solo hay oferta actual, aplica un descuento del 10% (precios de salida, no de " +
        "cierre). Servicio: POST /valoracion_automatica/.",
      inputSchema: valoracionAutomaticaShape,
    },
    withErrorHandling<ValoracionAutomaticaArgs>(async (args) => {
      const parsed = valoracionAutomaticaSchema.parse(args);
      return callIagestion("valoracion_automatica", parsed);
    })
  );
}
