/**
 * Fábrica compartida del McpServer de iagestión: registra todas las tools.
 * La usan tanto el entrypoint stdio (src/index.ts) como el remoto HTTP (src/httpServer.ts).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerInmueblesTools } from "./tools/inmuebles.js";
import { registerContactosTools } from "./tools/contactos.js";
import { registerDemandasTools } from "./tools/demandas.js";
import { registerGestionesTools } from "./tools/gestiones.js";
import { registerCatalogosTools } from "./tools/catalogos.js";
import { registerAgenciaTools } from "./tools/agencia.js";
import { registerAgentesTools } from "./tools/agentes.js";
import { registerPropietariosTools } from "./tools/propietarios.js";
import { registerPublicacionTools } from "./tools/publicacion.js";
import { registerProspectosTools } from "./tools/prospectos.js";
import { registerOperacionesTools } from "./tools/operaciones.js";
import { registerLeadsTools } from "./tools/leads.js";
import { registerOtrosTools } from "./tools/otros.js";
import { registerLicenciasTools } from "./tools/licencias.js";

export function createIagestionServer(): McpServer {
  const server = new McpServer({
    name: "iagestion-mcp",
    version: "2.0.0",
  });

  registerInmueblesTools(server);
  registerContactosTools(server);
  registerDemandasTools(server);
  registerGestionesTools(server);
  registerCatalogosTools(server);
  registerAgenciaTools(server);
  registerAgentesTools(server);
  registerPropietariosTools(server);
  registerPublicacionTools(server);
  registerProspectosTools(server);
  registerOperacionesTools(server);
  registerLeadsTools(server);
  registerOtrosTools(server);
  registerLicenciasTools(server);

  return server;
}
