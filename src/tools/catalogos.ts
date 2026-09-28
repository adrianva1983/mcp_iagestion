/**
 * Tool MCP para los catálogos/diccionarios de referencia de iagestión (todos de
 * solo lectura, admiten caché en el cliente):
 *   - iagestion_consultar_catalogos -> POST /provincias/ | /municipios/ | /poblaciones/ |
 *       /zonas/ | /paises/ | /tipo_inmueble/ | /tipo_operacion/ | /indicesBancarios/
 *
 * El parámetro `catalogo` selecciona a qué servicio REST se llama.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const CATALOGOS = [
  "provincias",
  "municipios",
  "poblaciones",
  "zonas",
  "paises",
  "tipo_inmueble",
  "tipo_operacion",
  "indicesBancarios",
] as const;

const binaryFlag = z.union([z.literal(0), z.literal(1)]);

const consultarCatalogosShape = {
  catalogo: z
    .enum(CATALOGOS)
    .describe(
      "Catálogo maestro a consultar: provincias, municipios (requiere provincia), poblaciones (requiere " +
        "municipio), zonas (requiere municipio), paises, tipo_inmueble, tipo_operacion o indicesBancarios."
    ),
  pais: z.string().optional().describe("[provincias] Nombre del país (por defecto España)."),
  provincia: z.string().optional().describe("[municipios] Obligatorio: nombre exacto de la provincia."),
  municipio: z.string().optional().describe("[poblaciones, zonas] Obligatorio: nombre exacto del municipio."),
  isla: z.string().optional().describe("[municipios] Filtra por isla (Canarias / Baleares)."),
  codigo: z.string().optional().describe('[indicesBancarios] Código del índice. Por defecto "EURIBOR".'),
  solo_con_inmuebles: binaryFlag
    .optional()
    .describe("[provincias, municipios, paises, tipo_inmueble, tipo_operacion] Si es 1, solo valores con cartera activa."),
  solo_los_mios: binaryFlag
    .optional()
    .describe("Combinado con solo_con_inmuebles, restringe a cartera propia de la agencia."),
};

const consultarCatalogosSchema = z
  .object(consultarCatalogosShape)
  .refine((v) => v.catalogo !== "municipios" || (v.provincia !== undefined && v.provincia !== ""), {
    message: 'El catálogo "municipios" requiere el parámetro provincia.',
    path: ["provincia"],
  })
  .refine(
    (v) => !["poblaciones", "zonas"].includes(v.catalogo) || (v.municipio !== undefined && v.municipio !== ""),
    { message: 'Los catálogos "poblaciones" y "zonas" requieren el parámetro municipio.', path: ["municipio"] }
  );
type ConsultarCatalogosArgs = z.infer<typeof consultarCatalogosSchema>;

export function registerCatalogosTools(server: McpServer): void {
  server.registerTool(
    "iagestion_consultar_catalogos",
    {
      title: "Consultar catálogos maestros de iagestión",
      description:
        "Obtiene datos maestros/diccionarios de referencia del CRM interno de la agencia (iagestión): " +
        "provincias, municipios, poblaciones, zonas comerciales, países, tipos de inmueble, tipos de " +
        "operación o índices bancarios de referencia (Euríbor y similares). Servicios: POST /provincias/, " +
        "/municipios/, /poblaciones/, /zonas/, /paises/, /tipo_inmueble/, /tipo_operacion/, /indicesBancarios/.",
      inputSchema: consultarCatalogosShape,
    },
    withErrorHandling<ConsultarCatalogosArgs>(async (args) => {
      const { catalogo, ...rest } = consultarCatalogosSchema.parse(args);
      return callIagestion(catalogo, rest);
    })
  );
}
