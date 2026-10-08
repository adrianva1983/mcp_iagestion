/**
 * Tools MCP para oportunidades de captación (inmuebles aún no incorporados a
 * la cartera, en fase de negociación con el propietario) en iagestión:
 *   - iagestion_buscar_prospectos     -> POST /prospectos/
 *   - iagestion_crear_prospecto       -> POST /grabar_prospecto/
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
// iagestion_crear_prospecto
// ---------------------------------------------------------------------------
// Registra el prospecto y, si hace falta, su contacto en la misma operación
// (todo o nada: si algo falla no se guarda nada). El contacto se identifica
// por IdContacto, o se busca por Movil/Email y se crea si no existe — hace
// falta al menos uno de los tres.

const OPINION_AGENTE = z.enum(["Buena", "Regular", "Mala", "Muy Buena", "Excelente"]);

const crearProspectoShape = {
  // Obligatorios
  Tipo: z
    .string()
    .describe(
      "Pisos, Casas o chalets, Locales, Oficinas, Negocios, Edificios, Naves, Fincas y solares, Garajes o " +
        "Trasteros (también admite sinónimos como Piso, Ático, Dúplex, Chalet...; se normaliza a la tipología estándar)."
    ),
  Operacion: z.string().describe('Venta, Alquiler...'),
  IdGestor: z.number().int().positive().describe("Agente de la agencia."),
  // Identificación del contacto — al menos uno de los tres
  IdContacto: z.number().int().positive().optional().describe("Contacto existente de la agencia."),
  Movil: z.string().optional().describe("Si no hay IdContacto, se busca el contacto por móvil y, si no, por email."),
  Email: z.string().optional(),
  // Datos del contacto, solo se usan si hay que crearlo
  Nombre: z.string().optional(),
  Apellidos: z.string().optional(),
  Telefono: z.string().optional(),
  NIF: z.string().optional(),
  DireccionCli: z.string().optional(),
  EstadoCivil: z.string().optional(),
  Idioma: z.string().optional().describe('Por defecto "es".'),
  // Opcionales — estado, asignación y referencias
  IdCaptador: z.number().int().positive().optional().describe("Agente de la agencia. Si no se envía, el gestor."),
  Estado: z.string().optional().describe('"Pendiente" por defecto.'),
  MotivoBaja: z.string().optional(),
  IdOficina: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Si no se envía, la oficina del gestor. Tiene que ser una oficina de la agencia (0 = sin oficina)."),
  RefCRM: z.string().optional(),
  RefIntranet: z.string().optional(),
  Titulo: z.string().optional(),
  Conociste: z.string().optional().describe("Origen del prospecto."),
  Descripcion: z.string().optional(),
  NotasPrivadas: z.string().optional(),
  OpinionAgente: z
    .union([OPINION_AGENTE, z.number().int().min(1).max(5)])
    .optional()
    .describe("Buena, Regular, Mala, Muy Buena, Excelente (o su número, de 1 a 5)."),
  CompradoresOVendedores: z.number().int().min(0).max(127).optional(),
  EmbudoOportunidad: z.number().int().min(0).max(127).optional(),
  EstadoEmbudo: z.number().int().min(0).max(127).optional(),
  FechaCaducidad: z.string().optional().describe("DD/MM/AAAA o AAAA-MM-DD, con hora opcional."),
  // Opcionales — ubicación
  Direccion: z.string().optional().describe("Si solo se envía Direccion, se guarda también en Direccion1."),
  Direccion1: z.string().optional(),
  Numero: z.string().optional(),
  BloquePortal: z.string().optional(),
  Planta1: z.string().optional(),
  Puerta: z.string().optional(),
  Planta: z.number().int().optional().describe("Negativo para sótanos."),
  CP: z.string().optional(),
  Zona: z.string().optional(),
  Municipio: z.string().optional(),
  Provincia: z.string().optional(),
  Poblacion: z.string().optional(),
  Pais: z.string().optional().describe('Por defecto "España".'),
  RC: z.string().optional().describe("Referencia catastral."),
  URLFicha: z.string().optional(),
  Latitud: z.number().optional(),
  Longitud: z.number().optional(),
  // Opcionales — características
  Habitaciones: z.number().int().nonnegative().optional(),
  Banios: z.number().int().nonnegative().optional(),
  Aseos: z.number().int().nonnegative().optional(),
  Garajes: z.number().int().nonnegative().optional(),
  Trastero: z.number().int().nonnegative().optional(),
  Ascensor: z.number().int().nonnegative().optional(),
  Terraza: z.number().int().nonnegative().optional(),
  Balcon: z.number().int().nonnegative().optional(),
  ArmarioEmpotrado: z.number().int().nonnegative().optional(),
  Piscina: z.number().int().nonnegative().optional(),
  Despensa: z.number().int().nonnegative().optional(),
  Exterior: z.number().int().min(0).max(127).optional(),
  SuperficieConstruida: z.number().nonnegative().optional(),
  SuperficieUtil: z.number().nonnegative().optional(),
  // Opcionales — precio y honorarios
  Precio: z.number().optional(),
  PrecioPropuesto: z.number().optional(),
  ValPropietarioPrecioFijo: z.number().optional(),
  ValPropietarioPorcentaje: z.number().optional(),
  PrecioFijo: z.number().optional(),
  PrecioFijoSinIva: z.number().optional(),
  HonorariosPrecioFijo: z.number().optional(),
  IvaPrecioFijo: z.number().optional(),
  PvpPrecioFijo: z.number().optional(),
  HonorariosPorcentaje: z.number().optional(),
  HonorariosMinimo: z.number().optional(),
  HonorariosMinimoSinIva: z.number().optional(),
  IvaPorcentaje: z.number().optional(),
  PvpPorcentaje: z.number().optional(),
  Honorarios01PrecioFijo: z.number().optional(),
  Honorarios01Porcentaje: z.number().optional(),
  ComisionesPropias: z.number().optional(),
};

const crearProspectoSchema = z
  .object(crearProspectoShape)
  .refine((v) => v.IdContacto !== undefined || v.Movil !== undefined || v.Email !== undefined, {
    message: "Debes indicar IdContacto, Movil o Email para identificar (o crear) el contacto.",
  });
type CrearProspectoArgs = z.infer<typeof crearProspectoSchema>;

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
    "iagestion_crear_prospecto",
    {
      title: "Crear prospecto en iagestión",
      description:
        "Registra un prospecto (inmueble en captación) y lo vincula a su contacto; si algo falla, no se " +
        "guarda nada. El contacto se identifica por IdContacto, o se busca por Movil/Email y se crea si no " +
        "existe (al menos uno de los tres). Obligatorios: Tipo, Operacion, IdGestor. Servicio: POST /grabar_prospecto/.",
      inputSchema: crearProspectoShape,
    },
    withErrorHandling<CrearProspectoArgs>(async (args) => {
      const parsed = crearProspectoSchema.parse(args);
      return callIagestion("grabar_prospecto", parsed);
    })
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
