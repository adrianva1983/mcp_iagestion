/**
 * Tools MCP para el recurso "gestion" (actividad comercial) de iagestión:
 *   - iagestion_registrar_gestion -> POST /grabar_gestion/
 *   - iagestion_buscar_gestiones  -> POST /gestiones/
 *   - iagestion_actualizar_gestion -> POST /actualizar_gestion/
 *   - iagestion_eliminar_gestion  -> POST /eliminar_gestion/
 *   - iagestion_agenda_citas      -> POST /agenda_citas/
 *
 * Nota: la API también expone `modificar_gestion`, una variante equivalente a
 * actualizar_gestion con otra convención de parámetros que convive en el
 * código desplegado. No se implementa aquí: el propio manual recomienda
 * confirmar con soporte de iagestión cuál es el servicio de referencia antes
 * de construir integraciones nuevas, así que usamos únicamente
 * actualizar_gestion (basado en lista blanca de campos permitidos).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------------
// iagestion_registrar_gestion
// ---------------------------------------------------------------------------

const registrarGestionShape = {
  accion: z
    .string()
    .optional()
    .default("crear")
    .describe(
      'Acción sobre la gestión. "crear" o "grabar" para el uso habitual; el CRM también admite ' +
        '"llamada automática", "mail automático" y "marcar_llamada" para sus propios flujos de automatización.'
    ),
  id_inmueble: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Al menos uno de id_inmueble, id_demanda o id_prospecto es obligatorio."),
  id_demanda: z.number().int().positive().optional(),
  id_prospecto: z.number().int().positive().optional(),
  id_contacto: z.number().int().positive().optional().describe("Id del contacto asociado a la gestión."),
  telefono_contacto: z.string().optional().describe("Teléfono del contacto, alternativa a id_contacto."),
  Tipo: z
    .string()
    .optional()
    .describe('P. ej. "Llamada", "Visita", "Reunion", "Email", "Oferta".'),
  Titulo: z.string().optional(),
  Descripcion: z.string().optional(),
  NotasPrivadas: z.string().optional(),
  AccionFechaPlanificacion: z
    .string()
    .regex(FECHA_REGEX, "AccionFechaPlanificacion debe tener formato YYYY-MM-DD")
    .optional()
    .describe("Fecha planificada en formato YYYY-MM-DD. Por defecto, ahora mismo."),
  AccionHoraPlanificacion: z
    .string()
    .regex(HORA_REGEX, "AccionHoraPlanificacion debe tener formato HH:mm")
    .optional()
    .describe("Hora planificada en formato HH:mm."),
  IdComercial: z.number().int().positive().optional(),
  importe_oferta: z.number().nonnegative().optional().describe('Solo relevante si Tipo="Oferta".'),
};

const registrarGestionSchema = z
  .object(registrarGestionShape)
  .refine(
    (v) => v.id_inmueble !== undefined || v.id_demanda !== undefined || v.id_prospecto !== undefined,
    { message: "Debes indicar id_inmueble, id_demanda o id_prospecto (al menos uno)." }
  );
type RegistrarGestionArgs = z.infer<typeof registrarGestionSchema>;

// ---------------------------------------------------------------------------
// iagestion_buscar_gestiones
// ---------------------------------------------------------------------------

const buscarGestionesShape = {
  FechaSyncDia: z.string().optional().describe("Sincronización por día exacto (YYYY-MM-DD)."),
  FechaSync: z.string().optional().describe("Sincronización incremental (YYYY-MM-DD HH:mm:ss)."),
  FechaPlanificadaDia: z.string().optional().describe("YYYY-MM-DD."),
  FechaPlanificada: z.string().optional().describe("YYYY-MM-DD HH:mm:ss."),
  Tipo: z.string().optional(),
  Estado: z.string().optional().describe("P. ej. Planificada, Cancelada, Realizada."),
  IdComercial: z.number().int().positive().optional(),
  IdUsuario: z.number().int().positive().optional(),
  IdInmueble: z.number().int().positive().optional(),
  IdDemanda: z.number().int().positive().optional(),
  IdSeguimiento: z.number().int().positive().optional().describe("Identifica un prospecto."),
  IdLead: z.number().int().positive().optional(),
  pagina: z.number().int().positive().optional().describe("Número de página (empezando en 1)."),
  numXpagina: z
    .number()
    .int()
    .positive()
    .max(500, "numXpagina no puede ser mayor de 500")
    .optional()
    .describe("Resultados por página (máximo 500)."),
};

const buscarGestionesSchema = z.object(buscarGestionesShape);
type BuscarGestionesArgs = z.infer<typeof buscarGestionesSchema>;

// ---------------------------------------------------------------------------
// iagestion_actualizar_gestion
// ---------------------------------------------------------------------------

const actualizarGestionShape = {
  Id_Gestion: z.number().int().positive().describe("Id de la gestión a modificar."),
  Tipo: z.string().optional(),
  Titulo: z.string().optional(),
  Descripcion: z.string().optional(),
  NotasPrivadas: z.string().optional(),
  Estado: z.enum(["Planificada", "Cancelada", "Realizada"]).optional(),
  FechaPlanificada: z.string().optional().describe("YYYY-MM-DD HH:mm:ss."),
  Duracion: z
    .union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120), z.literal(180), z.literal(240), z.literal(300)])
    .optional()
    .describe("Minutos. Calcula automáticamente la hora de fin."),
};

const actualizarGestionSchema = z.object(actualizarGestionShape);
type ActualizarGestionArgs = z.infer<typeof actualizarGestionSchema>;

// ---------------------------------------------------------------------------
// iagestion_eliminar_gestion
// ---------------------------------------------------------------------------

const eliminarGestionShape = {
  Id_Gestion: z.number().int().positive().describe("Id de la gestión a cancelar."),
};
type EliminarGestionArgs = z.infer<z.ZodObject<typeof eliminarGestionShape>>;

// ---------------------------------------------------------------------------
// iagestion_agenda_citas
// ---------------------------------------------------------------------------

const agendaCitasShape = {
  id_agente: z.number().int().positive().describe("Id del agente para el que calcular huecos libres."),
};
type AgendaCitasArgs = z.infer<z.ZodObject<typeof agendaCitasShape>>;

// ---------------------------------------------------------------------------
// Registro de tools
// ---------------------------------------------------------------------------

export function registerGestionesTools(server: McpServer): void {
  server.registerTool(
    "iagestion_registrar_gestion",
    {
      title: "Registrar gestión comercial en iagestión",
      description:
        "Registra en el CRM interno de la agencia (iagestión) una interacción comercial (visita, llamada, " +
        "correo, reunión, oferta) asociada a un inmueble, demanda o prospecto. Requiere id_inmueble, " +
        "id_demanda o id_prospecto (al menos uno). Servicio: POST /grabar_gestion/.",
      inputSchema: registrarGestionShape,
    },
    withErrorHandling<RegistrarGestionArgs>(async (args) => {
      const parsed = registrarGestionSchema.parse(args);
      return callIagestion("grabar_gestion", parsed);
    })
  );

  server.registerTool(
    "iagestion_buscar_gestiones",
    {
      title: "Buscar gestiones en iagestión",
      description:
        "Consulta la actividad comercial registrada en el CRM interno de la agencia (iagestión): llamadas, " +
        "visitas, reuniones, correos, filtrando por relación (inmueble, demanda, prospecto, lead), comercial " +
        "y fechas. Servicio: POST /gestiones/.",
      inputSchema: buscarGestionesShape,
    },
    withErrorHandling<BuscarGestionesArgs>(async (args) => callIagestion("gestiones", args))
  );

  server.registerTool(
    "iagestion_actualizar_gestion",
    {
      title: "Actualizar gestión en iagestión",
      description: "Actualiza campos de una gestión existente (estado, planificación, duración, notas...). Servicio: POST /actualizar_gestion/.",
      inputSchema: actualizarGestionShape,
    },
    withErrorHandling<ActualizarGestionArgs>(async (args) => callIagestion("actualizar_gestion", args))
  );

  server.registerTool(
    "iagestion_eliminar_gestion",
    {
      title: "Cancelar una gestión en iagestión",
      description: 'Cancela una gestión (Estado="Cancelada"); no existe borrado físico. Servicio: POST /eliminar_gestion/.',
      inputSchema: eliminarGestionShape,
    },
    withErrorHandling<EliminarGestionArgs>(async (args) => callIagestion("eliminar_gestion", args))
  );

  server.registerTool(
    "iagestion_agenda_citas",
    {
      title: "Huecos disponibles para citar a un agente en iagestión",
      description:
        "Calcula hasta 20 franjas libres en los próximos 10 días según el horario de atención configurado " +
        "del agente, evitando solapes con citas ya planificadas (margen de 30 minutos). Devuelve directamente " +
        "un array de fechas ISO, sin envolver en un objeto. Servicio: POST /agenda_citas/.",
      inputSchema: agendaCitasShape,
    },
    withErrorHandling<AgendaCitasArgs>(async (args) => callIagestion("agenda_citas", args))
  );
}
