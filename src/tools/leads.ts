/**
 * Tools MCP para leads de portales inmobiliarios (Idealista, Fotocasa...) en
 * iagestión, antes de convertirse en una demanda de trabajo:
 *   - iagestion_consultar_leads -> POST /consultar_leads/
 *   - iagestion_gestionar_lead  -> POST /gestionar_leads/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const consultarLeadsShape = {
  Id_inmueble: z.number().int().positive().optional(),
  Estado: z.enum(["Gestionado", "Descartado", "Pendiente"]).optional(),
};
type ConsultarLeadsArgs = z.infer<z.ZodObject<typeof consultarLeadsShape>>;

const gestionarLeadShape = {
  id_lead: z.number().int().positive().describe("Id del lead en DemandasPortales."),
  accion: z.enum(["descartar", "crear", "crear_editar"]),
  id_gestor: z.number().int().positive().optional().describe("Si no se envía, se usa el gestor del inmueble del lead."),
  comentarios: z.string().optional().describe("Se acumula sobre las notas existentes del lead (y de la demanda en crear/crear_editar)."),
  id_usuario: z.number().int().positive().optional().describe("Usuario que ejecuta la acción."),
};
const gestionarLeadSchema = z.object(gestionarLeadShape);
type GestionarLeadArgs = z.infer<typeof gestionarLeadSchema>;

export function registerLeadsTools(server: McpServer): void {
  server.registerTool(
    "iagestion_consultar_leads",
    {
      title: "Consultar leads de portales en iagestión",
      description:
        "Leads recibidos desde portales inmobiliarios (Idealista, Fotocasa...) para un inmueble, con su " +
        "estado de gestión. Servicio: POST /consultar_leads/.",
      inputSchema: consultarLeadsShape,
    },
    withErrorHandling<ConsultarLeadsArgs>(async (args) => callIagestion("consultar_leads", args))
  );

  server.registerTool(
    "iagestion_gestionar_lead",
    {
      title: "Convertir o descartar un lead en iagestión",
      description:
        'Gestiona el ciclo de vida de un lead de portal: lo descarta ("descartar"), o lo convierte en una ' +
        'demanda de trabajo creando el contacto si no existe ("crear" siempre crea una demanda nueva; ' +
        '"crear_editar" busca una demanda existente del mismo contacto y tipo de inmueble y la actualiza si ' +
        "la encuentra). Teléfono y email se toman siempre del propio lead. Servicio: POST /gestionar_leads/.",
      inputSchema: gestionarLeadShape,
    },
    withErrorHandling<GestionarLeadArgs>(async (args) => {
      const parsed = gestionarLeadSchema.parse(args);
      return callIagestion("gestionar_leads", parsed);
    })
  );
}
