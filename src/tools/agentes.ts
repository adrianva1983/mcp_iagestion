/**
 * Tools MCP para los usuarios internos (agentes) de la agencia en iagestión:
 *   - iagestion_consultar_agentes_interno -> POST /agentes_consultar/
 *   - iagestion_buscar_agentes            -> POST /agentes/
 *   - iagestion_crear_agente              -> POST /grabar_agente/
 *   - iagestion_actualizar_agente         -> POST /actualizar_agente/
 *   - iagestion_eliminar_agente           -> POST /eliminar_agente/
 *
 * El alta y la activación de agentes consumen licencias contratadas por la agencia.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const sinParametrosShape = {};
type SinParametrosArgs = z.infer<z.ZodObject<typeof sinParametrosShape>>;

// ---------------------------------------------------------------------------
// iagestion_buscar_agentes
// ---------------------------------------------------------------------------

const buscarAgentesShape = {
  id_agente: z.number().int().positive().optional().describe("Filtra un agente concreto por Id."),
  nombre: z.string().optional().describe("Búsqueda parcial por nombre."),
  apellidos: z.string().optional().describe("Búsqueda parcial por apellidos."),
  todos: z.enum(["si", "1"]).optional().describe("Incluye también el personal administrativo (excluido por defecto)."),
  orden: z.literal(1).optional().describe("Usa el orden manual configurado en el CRM en lugar del orden por defecto."),
  solo_con_licencia: z.union([z.literal(0), z.literal(1)]).optional().describe("Solo agentes con licencia de acceso activa."),
  geolocalizados: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe("Añade la última posición conocida de cada agente (última gestión con coordenadas)."),
};
const buscarAgentesSchema = z.object(buscarAgentesShape);
type BuscarAgentesArgs = z.infer<typeof buscarAgentesSchema>;

// ---------------------------------------------------------------------------
// iagestion_crear_agente
// ---------------------------------------------------------------------------

const crearAgenteShape = {
  Movil: z.string().describe("Obligatorio — también se usa para detectar duplicados."),
  Nombre: z.string().optional(),
  Apellidos: z.string().optional(),
  Email: z.string().email("Email no válido").optional(),
  CIF_NIF: z.string().optional(),
  FechaNacimiento: z.string().optional().describe("YYYY-MM-DD."),
  Direccion: z.string().optional(),
  CP: z.string().optional(),
  Municipio: z.string().optional(),
  Provincia: z.string().optional(),
  Poblacion: z.string().optional(),
  Pais: z.string().optional(),
  IdOficina: z.number().int().positive().optional(),
  IntroducidoPor: z.number().int().positive().optional().describe("Id del agente que lo da de alta."),
  AceptarComunicaciones: z.union([z.literal(0), z.literal(1)]).optional().describe("Activa boletín/SMS y desactiva la baja de correo."),
};
const crearAgenteSchema = z.object(crearAgenteShape);
type CrearAgenteArgs = z.infer<typeof crearAgenteSchema>;

// ---------------------------------------------------------------------------
// iagestion_actualizar_agente
// ---------------------------------------------------------------------------

const actualizarAgenteShape = {
  Id_Agente: z.number().int().positive().describe("Id del agente a modificar."),
  Nombre: z.string().optional(),
  Apellidos: z.string().optional(),
  Email: z.string().email("Email no válido").optional(),
  Movil: z.string().optional(),
  Direccion: z.string().optional(),
  Ciudad: z.string().optional(),
  Municipio: z.string().optional(),
  CP: z.string().optional(),
  Provincia: z.string().optional(),
  Activado: z.literal("si").optional().describe("Único valor aceptado para activar; consume licencia (o solicita ampliación si no quedan)."),
  FechaNacimiento: z.string().optional().describe("YYYY-MM-DD."),
};
const actualizarAgenteSchema = z.object(actualizarAgenteShape);
type ActualizarAgenteArgs = z.infer<typeof actualizarAgenteSchema>;

// ---------------------------------------------------------------------------
// iagestion_eliminar_agente
// ---------------------------------------------------------------------------

const eliminarAgenteShape = {
  Id_Agente: z.number().int().positive().describe("Id del agente a desactivar."),
};
type EliminarAgenteArgs = z.infer<z.ZodObject<typeof eliminarAgenteShape>>;

// ---------------------------------------------------------------------------
// Registro de tools
// ---------------------------------------------------------------------------

export function registerAgentesTools(server: McpServer): void {
  server.registerTool(
    "iagestion_consultar_agentes_interno",
    {
      title: "Consulta interna de agentes en iagestión",
      description:
        "Listado orientado a back-office de los usuarios internos de la agencia en iagestión: estado de " +
        "activación de cada agente y balance de licencias de la cuenta. No admite parámetros. " +
        "Servicio: POST /agentes_consultar/.",
      inputSchema: sinParametrosShape,
    },
    withErrorHandling<SinParametrosArgs>(async () => callIagestion("agentes_consultar", {}))
  );

  server.registerTool(
    "iagestion_buscar_agentes",
    {
      title: "Listado comercial de agentes en iagestión",
      description:
        "Ficha comercial de los agentes de la agencia (foto, cargo, redes sociales, vídeo de presentación), " +
        "pensada para mostrar en web/app. Agrupa por inmobiliaria si la credencial es de un grupo MLS. " +
        "Servicio: POST /agentes/.",
      inputSchema: buscarAgentesShape,
    },
    withErrorHandling<BuscarAgentesArgs>(async (args) => callIagestion("agentes", args))
  );

  server.registerTool(
    "iagestion_crear_agente",
    {
      title: "Crear agente en iagestión",
      description:
        "Crea un nuevo usuario interno (nivel de acceso comercial) en la agencia. Solo Movil es obligatorio. " +
        "Consume una licencia contratada de la agencia. Servicio: POST /grabar_agente/.",
      inputSchema: crearAgenteShape,
    },
    withErrorHandling<CrearAgenteArgs>(async (args) => callIagestion("grabar_agente", args))
  );

  server.registerTool(
    "iagestion_actualizar_agente",
    {
      title: "Actualizar agente en iagestión",
      description:
        'Modifica los datos de un agente existente. Enviar Activado="si" sobre un agente inactivo consume ' +
        "una licencia. Servicio: POST /actualizar_agente/.",
      inputSchema: actualizarAgenteShape,
    },
    withErrorHandling<ActualizarAgenteArgs>(async (args) => callIagestion("actualizar_agente", args))
  );

  server.registerTool(
    "iagestion_eliminar_agente",
    {
      title: "Dar de baja un agente en iagestión",
      description:
        'Baja LÓGICA: desactiva el acceso del agente (Activado="no") sin borrar su histórico ni sus ' +
        "gestiones. Servicio: POST /eliminar_agente/.",
      inputSchema: eliminarAgenteShape,
    },
    withErrorHandling<EliminarAgenteArgs>(async (args) => callIagestion("eliminar_agente", args))
  );
}
