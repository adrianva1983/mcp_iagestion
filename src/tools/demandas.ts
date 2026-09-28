/**
 * Tools MCP para el recurso "demandas" de iagestión:
 *   - iagestion_buscar_demandas      -> POST /demandas/
 *   - iagestion_crear_demanda        -> POST /grabar_demanda/
 *   - iagestion_actualizar_demanda   -> POST /actualizar_demanda/
 *   - iagestion_eliminar_demanda     -> POST /eliminar_demanda/
 *   - iagestion_consultar_cruces     -> POST /cruces_consultar/
 *   - iagestion_estadisticas_demanda -> POST /estadisticas_demanda/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const binaryFlag = z.union([z.literal(0), z.literal(1)]).describe("0 = no, 1 = sí");

// Campos de criterios de búsqueda compartidos por grabar_demanda y actualizar_demanda.
const criteriosDemandaShape = {
  TipoInmueble: z.string().optional(),
  TipoOperacion: z.string().optional().describe('P. ej. "Venta" o "Alquiler".'),
  PrecioDesde: z.number().nonnegative().optional(),
  PrecioHasta: z.number().nonnegative().optional(),
  Provincia: z.string().optional(),
  Municipio: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Uno o varios municipios: texto simple o array, p. ej. ["Gijón","Oviedo"] (se serializa como JSON).'),
  Poblacion: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Igual que Municipio: texto simple o array de poblaciones."),
  Habitaciones: z.number().int().nonnegative().optional(),
  Banos: z.number().int().nonnegative().optional(),
  Garaje: binaryFlag.optional(),
  Ascensor: binaryFlag.optional(),
  Terraza: binaryFlag.optional(),
  Trastero: binaryFlag.optional(),
  Piscina: binaryFlag.optional(),
  Alias: z.string().optional().describe("Nombre descriptivo de la búsqueda."),
  Observaciones: z.string().optional(),
  Notas: z.string().optional(),
  RefIntranet: z.string().optional(),
  IdGestor: z.number().int().positive().optional(),
  IdCaptador: z.number().int().positive().optional(),
  Webhook: z.string().optional().describe("URL de notificación de cruces para esta demanda."),
};

// ---------------------------------------------------------------------------
// iagestion_buscar_demandas
// ---------------------------------------------------------------------------

const buscarDemandasShape = {
  Estado: z
    .string()
    .optional()
    .describe('P. ej. "Activa", "Baja", "Completada". "Pendiente" incluye además las activas marcadas para cualificar.'),
  IdComercial: z.number().int().positive().optional().describe("Gestor asignado."),
  IdUsuario: z.number().int().positive().optional().describe("Contacto vinculado a la demanda."),
  Tipo: z.string().optional().describe("Tipo de inmueble demandado."),
  Id: z.number().int().positive().optional(),
  Buscar: z.string().optional().describe("Coincidencia exacta contra Id, nombre, teléfono u origen del contacto."),
  Necesita_Vender: z.enum(["si", "no"]).optional().describe("Compradores que antes necesitan vender su vivienda actual."),
  FechaSync: z.string().optional().describe("Sincronización incremental (YYYY-MM-DD HH:mm:ss)."),
  pagina: z.number().int().positive().optional().describe("Número de página (empezando en 1)."),
  numXpagina: z
    .number()
    .int()
    .positive()
    .max(500, "numXpagina no puede ser mayor de 500")
    .optional()
    .describe("Resultados por página (máximo 500)."),
};

const buscarDemandasSchema = z.object(buscarDemandasShape);
type BuscarDemandasArgs = z.infer<typeof buscarDemandasSchema>;

// ---------------------------------------------------------------------------
// iagestion_crear_demanda
// ---------------------------------------------------------------------------

const crearDemandaShape = {
  IdContacto: z.number().int().positive().optional().describe("Recomendado si el contacto ya existe (uno de IdContacto/Email/Telefono)."),
  Email: z.string().email("Email no válido").optional(),
  Telefono: z.string().optional().describe("Obligatorio si hay que crear el contacto."),
  Nombre: z.string().optional(),
  Apellidos: z.string().optional(),
  IdInmueble: z.number().int().positive().optional().describe("Inmueble de origen (el que generó el interés)."),
  ...criteriosDemandaShape,
};

const crearDemandaSchema = z
  .object(crearDemandaShape)
  .refine(
    (v) =>
      v.IdContacto !== undefined ||
      (v.Email !== undefined && v.Email !== "") ||
      (v.Telefono !== undefined && v.Telefono !== ""),
    { message: "Debes indicar IdContacto, Email o Telefono (al menos uno) para crear la demanda." }
  );
type CrearDemandaArgs = z.infer<typeof crearDemandaSchema>;

// ---------------------------------------------------------------------------
// iagestion_actualizar_demanda
// ---------------------------------------------------------------------------

const actualizarDemandaShape = {
  id_demanda: z.number().int().positive().describe("Id de la demanda a modificar."),
  Estado: z.enum(["Baja", "Pendiente", "Activa", "Completada"]).optional(),
  Necesita_Vender: z.enum(["Si", "No"]).optional(),
  OpinionAgente: z.enum(["Buena", "Regular", "Mala", "Muy Buena", "Excelente"]).optional(),
  CuandoComprar: z.string().optional().describe('Plazo estimado, p. ej. "Me urge mucho (menos de 3 meses)" (lista cerrada del CRM).'),
  Comprar: z.string().optional().describe("Motivo de compra, p. ej. Inversión, Traslado laboral (lista cerrada del CRM)."),
  FechaCaducidad: z.string().optional().describe("Admite varios formatos: YYYY-MM-DD, DD-MM-YYYY o DD/MM/YYYY."),
  ...criteriosDemandaShape,
};

const actualizarDemandaSchema = z.object(actualizarDemandaShape);
type ActualizarDemandaArgs = z.infer<typeof actualizarDemandaSchema>;

// ---------------------------------------------------------------------------
// iagestion_eliminar_demanda
// ---------------------------------------------------------------------------

const eliminarDemandaShape = {
  Id_Demanda: z.number().int().positive().describe("Id de la demanda a dar de baja."),
};
type EliminarDemandaArgs = z.infer<z.ZodObject<typeof eliminarDemandaShape>>;

// ---------------------------------------------------------------------------
// iagestion_consultar_cruces
// ---------------------------------------------------------------------------

const consultarCrucesShape = {
  Id_inmueble: z.number().int().positive().optional().describe("Uno de Id_inmueble/Id_demanda."),
  Id_demanda: z.number().int().positive().optional().describe("Uno de Id_inmueble/Id_demanda."),
};

const consultarCrucesSchema = z
  .object(consultarCrucesShape)
  .refine((v) => v.Id_inmueble !== undefined || v.Id_demanda !== undefined, {
    message: "Debes indicar Id_inmueble o Id_demanda (al menos uno).",
  });
type ConsultarCrucesArgs = z.infer<typeof consultarCrucesSchema>;

// ---------------------------------------------------------------------------
// iagestion_estadisticas_demanda
// ---------------------------------------------------------------------------

const estadisticasDemandaShape = {
  Municipio: z.string().optional(),
  Provincia: z.string().optional(),
  Zona: z.string().optional().describe("Se contrasta también contra el polígono geográfico de la zona."),
  FechaAlta: z.string().optional().describe("Rango de alta de la demanda: desde (YYYY-MM-DD)."),
  FechaAlta2: z.string().optional().describe("Rango de alta de la demanda: hasta (YYYY-MM-DD)."),
};
type EstadisticasDemandaArgs = z.infer<z.ZodObject<typeof estadisticasDemandaShape>>;

// ---------------------------------------------------------------------------
// Registro de tools
// ---------------------------------------------------------------------------

export function registerDemandasTools(server: McpServer): void {
  server.registerTool(
    "iagestion_buscar_demandas",
    {
      title: "Buscar demandas en iagestión",
      description:
        "Busca requerimientos o búsquedas activas de compradores/inquilinos en el CRM interno de la agencia " +
        "(iagestión), filtrando por estado, comercial, usuario, tipo, texto libre y paginación (máx. 500 por " +
        "página). Servicio: POST /demandas/.",
      inputSchema: buscarDemandasShape,
    },
    withErrorHandling<BuscarDemandasArgs>(async (args) => callIagestion("demandas", args))
  );

  server.registerTool(
    "iagestion_crear_demanda",
    {
      title: "Crear demanda en iagestión",
      description:
        "Registra los criterios de búsqueda de un cliente (demanda) en el CRM interno de la agencia " +
        "(iagestión). Identifica al contacto por IdContacto, Email o Telefono (al menos uno; la API busca o " +
        "crea el contacto según haga falta). Servicio: POST /grabar_demanda/.",
      inputSchema: crearDemandaShape,
    },
    withErrorHandling<CrearDemandaArgs>(async (args) => {
      const parsed = crearDemandaSchema.parse(args);
      return callIagestion("grabar_demanda", parsed);
    })
  );

  server.registerTool(
    "iagestion_actualizar_demanda",
    {
      title: "Actualizar demanda en iagestión",
      description:
        "Actualiza criterios y estado de una demanda existente en el CRM interno de la agencia (iagestión). " +
        "Si no se envía FechaCaducidad y la demanda ya estaba caducada o próxima a caducar, la API la renueva " +
        "automáticamente (+6 meses, +3 en alquiler). Servicio: POST /actualizar_demanda/.",
      inputSchema: actualizarDemandaShape,
    },
    withErrorHandling<ActualizarDemandaArgs>(async (args) => callIagestion("actualizar_demanda", args))
  );

  server.registerTool(
    "iagestion_eliminar_demanda",
    {
      title: "Dar de baja una demanda en iagestión",
      description: 'Baja LÓGICA de una demanda (Estado="Baja"). Servicio: POST /eliminar_demanda/.',
      inputSchema: eliminarDemandaShape,
    },
    withErrorHandling<EliminarDemandaArgs>(async (args) => callIagestion("eliminar_demanda", args))
  );

  server.registerTool(
    "iagestion_consultar_cruces",
    {
      title: "Cruces demanda ↔ inmueble en iagestión",
      description:
        "Coincidencias calculadas automáticamente por el motor de cruces del CRM entre una demanda y los " +
        "inmuebles disponibles de la agencia (o viceversa). Requiere Id_inmueble o Id_demanda. " +
        "Servicio: POST /cruces_consultar/.",
      inputSchema: consultarCrucesShape,
    },
    withErrorHandling<ConsultarCrucesArgs>(async (args) => {
      const parsed = consultarCrucesSchema.parse(args);
      return callIagestion("cruces_consultar", parsed);
    })
  );

  server.registerTool(
    "iagestion_estadisticas_demanda",
    {
      title: "Estadística de demanda por zona en iagestión",
      description:
        "Cuenta demandas activas que encajarían en una ubicación y rango de fechas de alta dados. Útil para " +
        "dimensionar el interés de mercado antes de publicar un inmueble. Servicio: POST /estadisticas_demanda/.",
      inputSchema: estadisticasDemandaShape,
    },
    withErrorHandling<EstadisticasDemandaArgs>(async (args) => callIagestion("estadisticas_demanda", args))
  );
}
