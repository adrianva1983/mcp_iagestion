/**
 * Tools MCP para oportunidades de captación (inmuebles aún no incorporados a
 * la cartera, en fase de negociación con el propietario) en iagestión:
 *   - iagestion_buscar_prospectos     -> POST /prospectos/
 *   - iagestion_actualizar_prospecto  -> POST /actualizar_prospecto/
 *   - iagestion_eliminar_prospecto    -> POST /eliminar_prospecto/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const OPERADOR = z.enum(["=", ">", ">=", "<", "<=", "LIKE", "BETWEEN"]);

// ---------------------------------------------------------------------------
// iagestion_buscar_prospectos
// ---------------------------------------------------------------------------
// Búsqueda avanzada: cada campo admite un operador de comparación mediante el
// sufijo `_op`; para BETWEEN se añaden `_from`/`_to` en vez del valor directo.
// El manual solo documenta explícitamente BETWEEN sobre Precio, FechaAlta y
// FechaModificacion — el resto de campos se exponen como filtro directo.

const buscarProspectosShape = {
  Id: z.number().int().positive().optional(),
  Estado: z.string().optional(),
  RefCRM: z.string().optional(),
  Email: z.string().optional(),
  Telefono: z.string().optional(),
  Operacion: z.string().optional(),
  Tipo: z.string().optional(),
  IdGestor: z.number().int().positive().optional(),
  IdCaptador: z.number().int().positive().optional(),
  Habitaciones: z.number().int().nonnegative().optional(),
  Banios: z.number().int().nonnegative().optional(),
  Aseos: z.number().int().nonnegative().optional(),
  Ascensor: z.union([z.literal(0), z.literal(1)]).optional(),
  Trastero: z.union([z.literal(0), z.literal(1)]).optional(),
  Terraza: z.union([z.literal(0), z.literal(1)]).optional(),
  Balcon: z.union([z.literal(0), z.literal(1)]).optional(),
  Piscina: z.union([z.literal(0), z.literal(1)]).optional(),
  SuperficieUtil: z.number().nonnegative().optional(),
  SuperficieConstruida: z.number().nonnegative().optional(),
  Planta: z.string().optional(),
  Direccion: z.string().optional(),
  CP: z.string().optional(),
  Numero: z.string().optional(),
  Municipio: z.string().optional(),
  Provincia: z.string().optional(),
  Poblacion: z.string().optional(),
  Latitud: z.number().optional(),
  Longitud: z.number().optional(),
  // Filtro directo o con operador (comparación simple)
  Precio: z.number().nonnegative().optional().describe("Filtro directo (usa Precio_op para comparación, o Precio_from/Precio_to con BETWEEN)."),
  Precio_op: OPERADOR.optional(),
  Precio_from: z.number().nonnegative().optional().describe("Con Precio_op=BETWEEN."),
  Precio_to: z.number().nonnegative().optional().describe("Con Precio_op=BETWEEN."),
  FechaAlta: z.string().optional().describe("YYYY-MM-DD. Admite BETWEEN vía FechaAlta_op/_from/_to."),
  FechaAlta_op: OPERADOR.optional(),
  FechaAlta_from: z.string().optional(),
  FechaAlta_to: z.string().optional(),
  FechaModificacion: z.string().optional().describe("YYYY-MM-DD. Admite BETWEEN vía FechaModificacion_op/_from/_to."),
  FechaModificacion_op: OPERADOR.optional(),
  FechaModificacion_from: z.string().optional(),
  FechaModificacion_to: z.string().optional(),
};
const buscarProspectosSchema = z.object(buscarProspectosShape);
type BuscarProspectosArgs = z.infer<typeof buscarProspectosSchema>;

// ---------------------------------------------------------------------------
// iagestion_actualizar_prospecto
// ---------------------------------------------------------------------------

const actualizarProspectoShape = {
  Id_Prospecto: z.number().int().positive(),
  Estado: z.string().optional(),
  RefCRM: z.string().optional(),
  Direccion: z.string().optional(),
  Municipio: z.string().optional(),
  Provincia: z.string().optional(),
  Poblacion: z.string().optional(),
  CP: z.string().optional(),
  Precio: z.number().nonnegative().optional(),
  PrecioPropuesto: z.number().nonnegative().optional(),
  Habitaciones: z.number().int().nonnegative().optional(),
  Banios: z.number().int().nonnegative().optional(),
  Aseos: z.number().int().nonnegative().optional(),
  Trastero: z.number().int().nonnegative().optional(),
  Ascensor: z.number().int().nonnegative().optional(),
  Tipo: z.string().optional().describe("Se normaliza a la tipología estándar."),
  Conociste: z.string().optional().describe("Origen del prospecto."),
};
const actualizarProspectoSchema = z.object(actualizarProspectoShape);
type ActualizarProspectoArgs = z.infer<typeof actualizarProspectoSchema>;

// ---------------------------------------------------------------------------
// iagestion_eliminar_prospecto
// ---------------------------------------------------------------------------

const eliminarProspectoShape = {
  Id_Prospecto: z.number().int().positive().describe("Id del prospecto a dar de baja."),
};
type EliminarProspectoArgs = z.infer<z.ZodObject<typeof eliminarProspectoShape>>;

// ---------------------------------------------------------------------------
// Registro de tools
// ---------------------------------------------------------------------------

export function registerProspectosTools(server: McpServer): void {
  server.registerTool(
    "iagestion_buscar_prospectos",
    {
      title: "Buscar prospectos en iagestión",
      description:
        "Búsqueda avanzada de oportunidades de captación (inmuebles aún no incorporados a la cartera, en " +
        "negociación con el propietario) en el CRM interno de la agencia (iagestión). Precio, FechaAlta y " +
        "FechaModificacion admiten comparación con operador (_op) o rango (BETWEEN vía _from/_to). " +
        "Servicio: POST /prospectos/.",
      inputSchema: buscarProspectosShape,
    },
    withErrorHandling<BuscarProspectosArgs>(async (args) => callIagestion("prospectos", args))
  );

  server.registerTool(
    "iagestion_actualizar_prospecto",
    {
      title: "Actualizar prospecto en iagestión",
      description: "Actualiza los datos de un prospecto en captación. Servicio: POST /actualizar_prospecto/.",
      inputSchema: actualizarProspectoShape,
    },
    withErrorHandling<ActualizarProspectoArgs>(async (args) => callIagestion("actualizar_prospecto", args))
  );

  server.registerTool(
    "iagestion_eliminar_prospecto",
    {
      title: "Dar de baja un prospecto en iagestión",
      description: 'Baja LÓGICA de un prospecto (Estado="Baja"). Servicio: POST /eliminar_prospecto/.',
      inputSchema: eliminarProspectoShape,
    },
    withErrorHandling<EliminarProspectoArgs>(async (args) => callIagestion("eliminar_prospecto", args))
  );
}
