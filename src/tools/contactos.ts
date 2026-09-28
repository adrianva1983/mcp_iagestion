/**
 * Tools MCP para el recurso "contactos" (CRM) de iagestión:
 *   - iagestion_buscar_contactos    -> POST /contactos/
 *   - iagestion_crear_contacto      -> POST /grabar_contacto/
 *   - iagestion_actualizar_contacto -> POST /actualizar_contacto/
 *   - iagestion_eliminar_contacto   -> POST /eliminar_contacto/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const IDIOMAS = ["es", "en", "de", "fr", "pt", "ru", "es-ca", "zh", "da", "ro", "el", "nl", "it", "es-gl"] as const;

// ---------------------------------------------------------------------------
// iagestion_buscar_contactos
// ---------------------------------------------------------------------------

const buscarContactosShape = {
  buscar: z
    .string()
    .optional()
    .describe("Coincidencia exacta contra móvil, nombre, apellidos, email, dirección o Id."),
  Nombre: z.string().optional().describe("Búsqueda parcial."),
  Apellidos: z.string().optional().describe("Búsqueda parcial."),
  Telefono: z.string().optional().describe("Coincidencia exacta."),
  Email: z.string().optional().describe("Coincidencia exacta."),
  Id: z.number().int().positive().optional(),
  RefIntranet: z.string().optional(),
  RefCRM: z.string().optional(),
  IdAgente: z.number().int().positive().optional().describe("Filtra por el agente que introdujo el contacto."),
  FechaSync: z.string().optional().describe("Sincronización incremental: solo altas/modificaciones posteriores a esta fecha (YYYY-MM-DD HH:mm:ss)."),
  pagina: z.number().int().positive().optional().describe("Número de página (empezando en 1)."),
  numXpagina: z
    .number()
    .int()
    .positive()
    .max(30, "numXpagina no puede ser mayor de 30")
    .optional()
    .describe("Resultados por página (máximo 30, por defecto 15)."),
};

const buscarContactosSchema = z.object(buscarContactosShape);
type BuscarContactosArgs = z.infer<typeof buscarContactosSchema>;

// ---------------------------------------------------------------------------
// iagestion_crear_contacto
// ---------------------------------------------------------------------------

const crearContactoShape = {
  Nombre: z.string().optional(),
  Apellidos: z.string().optional(),
  Email: z.string().email("Email no válido").optional().describe("Obligatorio si no se indica Movil."),
  Movil: z.string().optional().describe("Obligatorio si no se indica Email; también se usa para detectar duplicados."),
  Telefono2: z.string().optional(),
  Direccion: z.string().optional(),
  Municipio: z.string().optional(),
  Poblacion: z.string().optional(),
  CP: z.string().optional(),
  Provincia: z.string().optional(),
  Pais: z.string().optional(),
  Idioma: z.string().optional().describe('Código de idioma (es, en, fr...). Por defecto "es".'),
  FechaNacimiento: z.string().optional().describe("YYYY-MM-DD."),
  CIF_NIF: z.string().optional(),
  IdContactoOrigen: z.number().int().positive().optional().describe("Contacto que lo refirió."),
  AceptarComunicaciones: z.union([z.literal(0), z.literal(1)]).optional(),
};

const crearContactoSchema = z
  .object(crearContactoShape)
  .refine(
    (v) => (v.Email !== undefined && v.Email !== "") || (v.Movil !== undefined && v.Movil !== ""),
    { message: "Debes indicar Email o Movil (al menos uno) para crear el contacto." }
  );
type CrearContactoArgs = z.infer<typeof crearContactoSchema>;

// ---------------------------------------------------------------------------
// iagestion_actualizar_contacto
// ---------------------------------------------------------------------------

const actualizarContactoShape = {
  Id_Contacto: z.number().int().positive().describe("Id del contacto a modificar."),
  Nombre: z.string().optional(),
  Apellidos: z.string().optional(),
  Email: z.string().email("Email no válido").optional(),
  Movil: z.string().optional(),
  Direccion: z.string().optional(),
  Ciudad: z.string().optional(),
  Municipio: z.string().optional(),
  CP: z.string().optional(),
  Provincia: z.string().optional(),
  Ref_Intranet: z.string().optional(),
  Ref_CRM: z.string().optional(),
  Idioma_Usuario: z.enum(IDIOMAS).optional(),
  Origen_Usuario: z
    .string()
    .optional()
    .describe("Texto libre; se normaliza (fuzzy match) contra los orígenes ya existentes de la agencia."),
  Activado: z.literal("si").optional().describe('Único valor aceptado para activar. Consume licencia, igual que en agentes.'),
};

const actualizarContactoSchema = z.object(actualizarContactoShape);
type ActualizarContactoArgs = z.infer<typeof actualizarContactoSchema>;

// ---------------------------------------------------------------------------
// iagestion_eliminar_contacto
// ---------------------------------------------------------------------------

const eliminarContactoShape = {
  Id_Contacto: z.number().int().positive().describe("Id del contacto a dar de baja."),
};
type EliminarContactoArgs = z.infer<z.ZodObject<typeof eliminarContactoShape>>;

// ---------------------------------------------------------------------------
// Registro de tools
// ---------------------------------------------------------------------------

export function registerContactosTools(server: McpServer): void {
  server.registerTool(
    "iagestion_buscar_contactos",
    {
      title: "Buscar contactos en iagestión",
      description:
        "Busca personas/clientes en el CRM interno de la agencia (iagestión) por móvil, nombre, email, Id o " +
        "referencia externa, con paginación (máx. 30 resultados por página). Servicio: POST /contactos/.",
      inputSchema: buscarContactosShape,
    },
    withErrorHandling<BuscarContactosArgs>(async (args) => callIagestion("contactos", args))
  );

  server.registerTool(
    "iagestion_crear_contacto",
    {
      title: "Crear contacto en iagestión",
      description:
        "Da de alta un nuevo contacto (interesado, propietario, etc.) en el CRM interno de la agencia " +
        "(iagestión). Requiere Email o Movil (al menos uno). Servicio: POST /grabar_contacto/.",
      inputSchema: crearContactoShape,
    },
    withErrorHandling<CrearContactoArgs>(async (args) => {
      const parsed = crearContactoSchema.parse(args);
      return callIagestion("grabar_contacto", parsed);
    })
  );

  server.registerTool(
    "iagestion_actualizar_contacto",
    {
      title: "Actualizar contacto en iagestión",
      description:
        "Modifica los datos de un contacto existente en el CRM interno de la agencia (iagestión). Requiere " +
        "Id_Contacto. Servicio: POST /actualizar_contacto/.",
      inputSchema: actualizarContactoShape,
    },
    withErrorHandling<ActualizarContactoArgs>(async (args) => callIagestion("actualizar_contacto", args))
  );

  server.registerTool(
    "iagestion_eliminar_contacto",
    {
      title: "Dar de baja un contacto en iagestión",
      description:
        'Baja LÓGICA de un contacto (Activado="no"), no se borra físicamente. Servicio: POST /eliminar_contacto/.',
      inputSchema: eliminarContactoShape,
    },
    withErrorHandling<EliminarContactoArgs>(async (args) => callIagestion("eliminar_contacto", args))
  );
}
