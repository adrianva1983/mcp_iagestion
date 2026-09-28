/**
 * Tools MCP para el recurso "inmuebles" de iagestión (CRM inmobiliario):
 *   - iagestion_buscar_inmuebles       -> POST /inmuebles/
 *   - iagestion_obtener_inmueble       -> POST /inmueble/
 *   - iagestion_crear_inmueble         -> POST /grabar_inmueble/
 *   - iagestion_actualizar_inmueble    -> POST /actualizar_inmueble/
 *   - iagestion_eliminar_inmueble      -> POST /eliminar_inmueble/
 *   - iagestion_vincular_adjunto       -> POST /grabar_adjunto/
 *   - iagestion_puntos_interes_inmueble -> POST /puntosInteres/
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callIagestion } from "../client.js";
import { withErrorHandling } from "../toolResult.js";

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const binaryFlag = z
  .union([z.literal(0), z.literal(1)])
  .describe("0 = no, 1 = sí");

// Contexto compartido: deja claro que operan sobre la cartera interna del
// CRM, no sobre portales públicos (Idealista, Fotocasa...).
const CONTEXTO_CRM =
  "Opera sobre la cartera INTERNA de la agencia en el CRM iagestión (los inmuebles que la agencia " +
  "gestiona/tiene dados de alta), no sobre anuncios públicos de portales como Idealista o Fotocasa.";

// Bloque JSON reutilizable para imágenes/tours/vídeos/traducciones que acepta
// tanto grabar_inmueble como actualizar_inmueble.
const imagenSchema = z.object({
  URL: z.string(),
  Descripcion: z.string().optional(),
  Orden: z.number().int().optional(),
  Pano360: binaryFlag.optional(),
  Plano: binaryFlag.optional(),
});
const tourVideoSchema = z.object({
  Codigo: z.string(),
  Plataforma: z.string().optional(),
  Orden: z.number().int().optional(),
  CheckCompartir: binaryFlag.optional(),
});
const traduccionSchema = z.object({
  idioma: z.string(),
  campo: z.string(),
  texto: z.string(),
});

// ---------------------------------------------------------------------------
// iagestion_buscar_inmuebles
// ---------------------------------------------------------------------------

const buscarInmueblesShape = {
  Tipo: z.string().optional().describe('Tipo de inmueble, p. ej. "Pisos", "Chalets", "Locales"...'),
  SubTipo: z.string().optional().describe('Subtipo, p. ej. "Apartamento", "Dúplex".'),
  TipoOperacion: z.string().optional().describe('Operación buscada, p. ej. "Venta" o "Alquiler".'),
  Referencia: z.string().optional().describe("Busca por Ref_CRM o Ref_Intranet."),
  ReferenciaExacta: binaryFlag.optional().describe("Si es 1, exige coincidencia exacta de la referencia."),
  Pais: z.string().optional(),
  Provincia: z.string().optional(),
  Municipio: z.string().optional(),
  Poblacion: z.string().optional(),
  Zona: z.string().optional(),
  ZonaProvincial: z.string().optional(),
  CoincidenciaExacta: binaryFlag.optional().describe("Exige coincidencia exacta en Municipio/Provincia."),
  PrecioMin: z.number().nonnegative().optional(),
  PrecioMax: z.number().nonnegative().optional(),
  Habitaciones: z.number().int().nonnegative().optional().describe("Mínimo de habitaciones."),
  Banos: z.number().int().nonnegative().optional().describe("Mínimo de baños."),
  SuperficieConstruida: z.number().nonnegative().optional().describe("Mínimo de metros construidos."),
  SuperficieParcela: z.number().nonnegative().optional().describe("Mínimo de metros de parcela."),
  Garaje: binaryFlag.optional(),
  Terraza: binaryFlag.optional(),
  Trastero: binaryFlag.optional(),
  Piscina: binaryFlag.optional(),
  Ascensor: binaryFlag.optional(),
  CheckAireAcondicionado: binaryFlag.optional(),
  CheckJardin: binaryFlag.optional(),
  ArmarioEmpotrado: binaryFlag.optional(),
  HuecosExteriores: binaryFlag.optional(),
  Estado: z
    .string()
    .optional()
    .default("Disponible")
    .describe('Estado del inmueble. Por defecto "Disponible".'),
  TambienVendidos: binaryFlag.optional().describe("Si es 1, amplía Estado a Reservado/Vendido además de Disponible."),
  Destacados: binaryFlag.optional(),
  Novedades: binaryFlag.optional(),
  Rebajados: binaryFlag.optional(),
  Etiquetas: z.string().optional().describe("Filtra por etiquetas asignadas al inmueble."),
  Latitud: z.number().optional(),
  Longitud: z.number().optional(),
  Distancia: z.number().nonnegative().optional().describe("Radio en Km para búsqueda geográfica (con Latitud/Longitud)."),
  area: z.string().optional().describe("Polígono de búsqueda: lista de coordenadas."),
  IdGestor: z.number().int().positive().optional(),
  IdOficina: z.number().int().positive().optional(),
  IdPromocion: z.number().int().positive().optional(),
  solo_los_mios: binaryFlag
    .optional()
    .describe("Si es 1, restringe a inmuebles propios (por defecto incluye red/MLS)."),
  publicadosWeb: binaryFlag.optional().describe("Si es 1, solo inmuebles marcados para publicación web."),
  orden: z.string().optional().describe("Campo de ordenación."),
  ascdesc: z.enum(["ASC", "DESC"]).optional(),
  idioma: z.string().optional().describe("Devuelve título/descripción traducidos a ese idioma cuando existen."),
  Id_usuario: z.number().int().positive().optional().describe("Marca qué inmuebles son favoritos de ese usuario final."),
  numXpagina: z.number().int().positive().optional().describe("Resultados por página."),
  pagina: z.number().int().positive().optional().describe("Número de página (empezando en 1)."),
};

const buscarInmueblesSchema = z.object(buscarInmueblesShape);
type BuscarInmueblesArgs = z.infer<typeof buscarInmueblesSchema>;

// ---------------------------------------------------------------------------
// iagestion_obtener_inmueble
// ---------------------------------------------------------------------------

const obtenerInmuebleShape = {
  Id: z.number().int().positive().optional().describe("Id numérico interno del inmueble."),
  Ref: z.string().optional().describe("Referencia del inmueble."),
  Id_usuario: z.number().int().positive().optional().describe("Marca si el inmueble es favorito de ese usuario."),
};

const obtenerInmuebleSchema = z
  .object(obtenerInmuebleShape)
  .refine((v) => v.Id !== undefined || (v.Ref !== undefined && v.Ref !== ""), {
    message: "Debes indicar Id o Ref para identificar el inmueble.",
  });
type ObtenerInmuebleArgs = z.infer<typeof obtenerInmuebleSchema>;

// ---------------------------------------------------------------------------
// iagestion_crear_inmueble
// ---------------------------------------------------------------------------

const crearInmuebleShape = {
  // Obligatorios
  Tipo: z.string().describe('Tipo de inmueble, p. ej. "Pisos", "Chalets" (se normaliza a la tipología estándar).'),
  Estado: z.string().describe('Estado del inmueble, p. ej. "Pendiente", "Disponible".'),
  Operacion: z.string().describe('Operación, p. ej. "Venta" o "Alquiler".'),
  Direccion: z.string().describe("Dirección postal del inmueble."),
  Fecha: z.string().regex(FECHA_REGEX, "Fecha debe tener formato YYYY-MM-DD").describe("Fecha de alta en formato YYYY-MM-DD."),
  Ref_Intranet: z.string().describe("Referencia interna/intranet única del inmueble en la agencia."),
  // Opcionales — características
  Precio: z.number().nonnegative().optional(),
  Metros_Construidos: z.number().nonnegative().optional(),
  Metros_Utiles: z.number().nonnegative().optional(),
  Metros_Parcela: z.number().nonnegative().optional(),
  Dormitorios: z.number().int().nonnegative().optional(),
  Banos: z.number().int().nonnegative().optional(),
  Aseos: z.number().int().nonnegative().optional(),
  Ascensor: z.number().int().nonnegative().optional(),
  Garajes: z.number().int().nonnegative().optional(),
  Terraza: z.number().int().nonnegative().optional(),
  Piscina: z.number().int().nonnegative().optional(),
  Trastero: z.number().int().nonnegative().optional(),
  // Opcionales — ubicación
  Municipio: z.string().optional(),
  Poblacion: z.string().optional(),
  Provincia: z.string().optional(),
  Pais: z.string().optional(),
  CP: z.string().optional().describe("Código postal."),
  Zona: z.string().optional(),
  Latitud: z.number().optional(),
  Longitud: z.number().optional(),
  // Opcionales — contenido
  TitularPublico: z.string().optional().describe("Título/titular público del anuncio."),
  Titulo: z.string().optional(),
  Observaciones_Publicas: z.string().optional(),
  Observaciones_Privadas: z.string().optional(),
  // Opcionales — asignación y propietario
  Nombre_captador: z.string().optional().describe("Junto a Apellidos_captador, asigna el inmueble a ese agente como captador/gestor."),
  Apellidos_captador: z.string().optional(),
  Movil_contacto: z.string().optional().describe("Vincula o crea un contacto (propietario) sobre el inmueble."),
  // Opcionales — multimedia y traducciones (JSON)
  imagenes: z.array(imagenSchema).optional().describe("Array de fotos: [{URL, Descripcion, Orden, Pano360, Plano}]."),
  tours: z.array(tourVideoSchema).optional().describe("Array de visitas virtuales: [{Codigo, Plataforma, Orden, CheckCompartir}]."),
  videos: z.array(tourVideoSchema).optional().describe("Array de vídeos: [{Codigo, Plataforma, Orden, CheckCompartir}]."),
  traducciones: z.array(traduccionSchema).optional().describe("Array de traducciones: [{idioma, campo, texto}]."),
};

const crearInmuebleSchema = z.object(crearInmuebleShape);
type CrearInmuebleArgs = z.infer<typeof crearInmuebleSchema>;

// ---------------------------------------------------------------------------
// iagestion_actualizar_inmueble
// ---------------------------------------------------------------------------

const actualizarInmuebleShape = {
  Id_Inmueble: z.number().int().positive().optional().describe("Id numérico interno del inmueble a modificar."),
  Ref_Intranet: z.string().optional().describe("Referencia interna/intranet del inmueble a modificar (alternativa a Id_Inmueble)."),
  // Mismo catálogo de campos editables que crear_inmueble, todos opcionales:
  Tipo: z.string().optional(),
  Estado: z.string().optional(),
  Operacion: z.string().optional(),
  Direccion: z.string().optional(),
  Fecha: z.string().regex(FECHA_REGEX, "Fecha debe tener formato YYYY-MM-DD").optional(),
  Precio: z.number().nonnegative().optional(),
  Metros_Construidos: z.number().nonnegative().optional(),
  Metros_Utiles: z.number().nonnegative().optional(),
  Metros_Parcela: z.number().nonnegative().optional(),
  Dormitorios: z.number().int().nonnegative().optional(),
  Banos: z.number().int().nonnegative().optional(),
  Aseos: z.number().int().nonnegative().optional(),
  Ascensor: z.number().int().nonnegative().optional(),
  Garajes: z.number().int().nonnegative().optional(),
  Terraza: z.number().int().nonnegative().optional(),
  Piscina: z.number().int().nonnegative().optional(),
  Trastero: z.number().int().nonnegative().optional(),
  Municipio: z.string().optional(),
  Poblacion: z.string().optional(),
  Provincia: z.string().optional(),
  Pais: z.string().optional(),
  CP: z.string().optional(),
  Zona: z.string().optional(),
  Latitud: z.number().optional(),
  Longitud: z.number().optional(),
  TitularPublico: z.string().optional(),
  Titulo: z.string().optional(),
  Observaciones_Publicas: z.string().optional(),
  Observaciones_Privadas: z.string().optional(),
  Nombre_captador: z.string().optional(),
  Apellidos_captador: z.string().optional(),
  Movil_contacto: z.string().optional(),
  imagenes: z.array(imagenSchema).optional(),
  tours: z.array(tourVideoSchema).optional(),
  videos: z.array(tourVideoSchema).optional(),
  traducciones: z.array(traduccionSchema).optional(),
  Reservar_Visita: z.literal(1).optional().describe("Bloquea temporalmente las visitas vía red MLS."),
};

const actualizarInmuebleSchema = z
  .object(actualizarInmuebleShape)
  .refine((v) => v.Id_Inmueble !== undefined || (v.Ref_Intranet !== undefined && v.Ref_Intranet !== ""), {
    message: "Debes indicar Id_Inmueble o Ref_Intranet para identificar el inmueble a actualizar.",
  });
type ActualizarInmuebleArgs = z.infer<typeof actualizarInmuebleSchema>;

// ---------------------------------------------------------------------------
// iagestion_eliminar_inmueble
// ---------------------------------------------------------------------------

const eliminarInmuebleShape = {
  Id_Inmueble: z.number().int().positive().describe("Id del inmueble a dar de baja."),
};
type EliminarInmuebleArgs = z.infer<z.ZodObject<typeof eliminarInmuebleShape>>;

// ---------------------------------------------------------------------------
// iagestion_vincular_adjunto
// ---------------------------------------------------------------------------

const vincularAdjuntoShape = {
  URL: z.string().describe("Ubicación del fichero ya alojado (contrato, nota simple, cédula...)."),
  id_contacto: z.number().int().positive().describe("Contacto asociado al documento."),
  id_inmueble: z.number().int().positive().optional().describe("Inmueble al que se vincula (uno de id_inmueble/id_demanda)."),
  id_demanda: z.number().int().positive().optional().describe("Demanda a la que se vincula (uno de id_inmueble/id_demanda)."),
  Titulo: z.string().optional(),
  Privado: z.union([z.literal(0), z.literal(1)]).optional().describe("1 = visible solo internamente."),
  ref_intranet: z.string().optional(),
};

const vincularAdjuntoSchema = z
  .object(vincularAdjuntoShape)
  .refine((v) => v.id_inmueble !== undefined || v.id_demanda !== undefined, {
    message: "Debes indicar id_inmueble o id_demanda (al menos uno).",
  });
type VincularAdjuntoArgs = z.infer<typeof vincularAdjuntoSchema>;

// ---------------------------------------------------------------------------
// iagestion_puntos_interes_inmueble
// ---------------------------------------------------------------------------

const puntosInteresShape = {
  Id: z.number().int().positive().describe("Id del inmueble."),
};
type PuntosInteresArgs = z.infer<z.ZodObject<typeof puntosInteresShape>>;

// ---------------------------------------------------------------------------
// Registro de tools
// ---------------------------------------------------------------------------

export function registerInmueblesTools(server: McpServer): void {
  server.registerTool(
    "iagestion_buscar_inmuebles",
    {
      title: "Buscar inmuebles en iagestión",
      description:
        `${CONTEXTO_CRM} Busca y lista propiedades aplicando filtros (tipo, operación, ubicación, precio, ` +
        "habitaciones, baños, equipamiento, geolocalización, destacados/novedades/rebajados, etc.) con " +
        "paginación. Servicio: POST /inmuebles/.",
      inputSchema: buscarInmueblesShape,
    },
    withErrorHandling<BuscarInmueblesArgs>(async (args) => callIagestion("inmuebles", args))
  );

  server.registerTool(
    "iagestion_obtener_inmueble",
    {
      title: "Obtener ficha de inmueble en iagestión",
      description:
        `${CONTEXTO_CRM} Obtiene la ficha técnica completa de una propiedad (características, fotos, vídeos, ` +
        "visitas virtuales, tags, traducciones, gestor, etc.) por Id o Referencia. Servicio: POST /inmueble/.",
      inputSchema: obtenerInmuebleShape,
    },
    withErrorHandling<ObtenerInmuebleArgs>(async (args) => {
      const parsed = obtenerInmuebleSchema.parse(args);
      return callIagestion("inmueble", parsed);
    })
  );

  server.registerTool(
    "iagestion_crear_inmueble",
    {
      title: "Crear inmueble en iagestión",
      description:
        `${CONTEXTO_CRM} Da de alta una nueva propiedad. Obligatorios: Tipo, Estado, Operacion, Direccion, ` +
        "Fecha (YYYY-MM-DD), Ref_Intranet (única por agencia). Admite fotos/tours/vídeos/traducciones como " +
        "arrays JSON. Servicio: POST /grabar_inmueble/.",
      inputSchema: crearInmuebleShape,
    },
    withErrorHandling<CrearInmuebleArgs>(async (args) => callIagestion("grabar_inmueble", args))
  );

  server.registerTool(
    "iagestion_actualizar_inmueble",
    {
      title: "Actualizar inmueble en iagestión",
      description:
        `${CONTEXTO_CRM} Modifica una propiedad existente. Requiere Id_Inmueble o Ref_Intranet, más cualquiera ` +
        "de los campos editables a cambiar (solo se escriben los campos enviados que difieren del valor ya " +
        "guardado). Servicio: POST /actualizar_inmueble/.",
      inputSchema: actualizarInmuebleShape,
    },
    withErrorHandling<ActualizarInmuebleArgs>(async (args) => {
      const parsed = actualizarInmuebleSchema.parse(args);
      return callIagestion("actualizar_inmueble", parsed);
    })
  );

  server.registerTool(
    "iagestion_eliminar_inmueble",
    {
      title: "Dar de baja un inmueble en iagestión",
      description:
        `${CONTEXTO_CRM} Baja LÓGICA de una propiedad (Estado="Baja"): deja de aparecer en búsquedas pero ` +
        "conserva su histórico completo, no se borra físicamente. Servicio: POST /eliminar_inmueble/.",
      inputSchema: eliminarInmuebleShape,
    },
    withErrorHandling<EliminarInmuebleArgs>(async (args) => callIagestion("eliminar_inmueble", args))
  );

  server.registerTool(
    "iagestion_vincular_adjunto",
    {
      title: "Vincular un documento a un inmueble o demanda en iagestión",
      description:
        "Registra en el CRM la referencia a un fichero ya alojado en otro sitio (contrato, nota simple, " +
        "cédula...), vinculándolo a un inmueble o demanda y a un contacto. No sube el fichero: requiere una " +
        "URL donde ya esté disponible. Servicio: POST /grabar_adjunto/.",
      inputSchema: vincularAdjuntoShape,
    },
    withErrorHandling<VincularAdjuntoArgs>(async (args) => {
      const parsed = vincularAdjuntoSchema.parse(args);
      return callIagestion("grabar_adjunto", parsed);
    })
  );

  server.registerTool(
    "iagestion_puntos_interes_inmueble",
    {
      title: "Puntos de interés de un inmueble en iagestión",
      description:
        "Colegios, transporte, comercios y otros puntos de interés vinculados manualmente a la ficha de un " +
        "inmueble. Servicio: POST /puntosInteres/.",
      inputSchema: puntosInteresShape,
    },
    withErrorHandling<PuntosInteresArgs>(async (args) => callIagestion("puntosInteres", args))
  );
}
