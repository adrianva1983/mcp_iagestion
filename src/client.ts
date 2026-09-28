/**
 * Cliente HTTP para la API v3 de iagestión (CRM inmobiliario).
 *
 * Nota de nombres: el propio backend de la API publica sus endpoints bajo el
 * segmento de ruta histórico `/api-gestioninmo/v3/` (nombre técnico interno
 * de la API que no controlamos), aunque el producto/CRM se llama
 * comercialmente "iagestión". Por eso la URL base conserva "gestioninmo" en
 * la ruta, pero todo el código, las tools y los mensajes de cara al usuario
 * usan el nombre actual "iagestión".
 *
 * Reglas de la API implementadas aquí:
 *  - Base URL: https://pasarelas.iagestion.com/api-gestioninmo/v3/{servicio}/
 *  - Método: POST siempre.
 *  - Content-Type: application/x-www-form-urlencoded.
 *  - Auth: Authorization: Bearer <token M2M>. En stdio sale de IAGESTION_API_TOKEN;
 *    en el transporte HTTP multiusuario, del usuario de la petición (requestContext.ts).
 *  - Peculiaridad: la API puede responder HTTP 200 con un error de negocio en el
 *    cuerpo ({"validacion":"error", "mensaje": "..."} o {"error": true, ...}).
 *    Este cliente detecta ese caso y lanza IagestionApiError para que las
 *    tools lo conviertan en isError: true de cara a MCP.
 */

import axios, { AxiosInstance, isAxiosError } from "axios";
import { currentUser } from "./requestContext.js";

// IAGESTION_BASE_URL solo se sobreescribe para pruebas contra una API simulada.
export const IAGESTION_BASE_URL =
  process.env.IAGESTION_BASE_URL ?? "https://pasarelas.iagestion.com/api-gestioninmo/v3";

/** Error de dominio: agrupa tanto fallos HTTP como errores de negocio devueltos con HTTP 200. */
export class IagestionApiError extends Error {
  public readonly servicio?: string;
  public readonly httpStatus?: number;
  public readonly raw?: unknown;

  constructor(
    message: string,
    opts?: { servicio?: string; httpStatus?: number; raw?: unknown }
  ) {
    super(message);
    this.name = "IagestionApiError";
    this.servicio = opts?.servicio;
    this.httpStatus = opts?.httpStatus;
    this.raw = opts?.raw;
  }
}

/** Valores primitivos aceptados como parámetros de petición. Arrays/objetos se serializan a JSON. */
export type RequestParams = Record<
  string,
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>
  | Record<string, unknown>[]
  | undefined
  | null
>;

function getToken(): string {
  // Con contexto de usuario (transporte HTTP) se usa SIEMPRE el token de ese
  // usuario, sin caer nunca al de otro. Sin contexto (stdio) vale la variable
  // de entorno IAGESTION_API_TOKEN.
  const user = currentUser();
  const token = user ? user.apiToken : process.env.IAGESTION_API_TOKEN;
  if (!token || token.trim() === "") {
    throw new IagestionApiError(
      user
        ? "Tu usuario no tiene un token de iagestión configurado. Pide al administrador que lo asigne (admin set-token)."
        : "Falta la variable de entorno IAGESTION_API_TOKEN con el token M2M (Bearer) de iagestión. " +
            "Configúrala en el entorno del proceso o en la configuración del cliente MCP antes de usar esta herramienta."
    );
  }
  return token;
}

function buildClient(): AxiosInstance {
  return axios.create({
    baseURL: IAGESTION_BASE_URL,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
    // Nunca lanzar por status HTTP: queremos inspeccionar siempre el cuerpo
    // (incluidos los códigos de error) para dar un mensaje legible.
    validateStatus: () => true,
  });
}

/** Convierte los parámetros de la tool en un body application/x-www-form-urlencoded. */
function toFormBody(params: RequestParams): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value === "") continue;
    if (Array.isArray(value) || typeof value === "object") {
      usp.append(key, JSON.stringify(value));
    } else {
      usp.append(key, String(value));
    }
  }
  return usp;
}

function extractMessage(data: unknown): string | undefined {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.mensaje === "string" && obj.mensaje.trim() !== "") return obj.mensaje;
    if (typeof obj.message === "string" && obj.message.trim() !== "") return obj.message;
    if (typeof obj.error === "string" && obj.error.trim() !== "") return obj.error;
  }
  if (typeof data === "string" && data.trim() !== "") return data;
  return undefined;
}

/** Detecta el patrón de error de negocio devuelto con HTTP 200. */
function businessError(data: unknown): string | undefined {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.validacion === "error") {
      return extractMessage(obj) ?? "La API de iagestión devolvió un error de validación sin mensaje.";
    }
    if (obj.error === true) {
      return extractMessage(obj) ?? "La API de iagestión devolvió error: true sin mensaje.";
    }
  }
  return undefined;
}

/**
 * Llama a un servicio de la API v3 de iagestión vía POST x-www-form-urlencoded.
 * Lanza IagestionApiError tanto para fallos HTTP como para errores de negocio con HTTP 200.
 */
export async function callIagestion(
  servicio: string,
  params: RequestParams = {}
): Promise<unknown> {
  const client = buildClient();
  const body = toFormBody(params);
  const path = `/${servicio.replace(/^\/|\/$/g, "")}/`;

  let status: number;
  let data: unknown;
  try {
    const response = await client.post(path, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    status = response.status;
    data = response.data;
  } catch (err) {
    if (isAxiosError(err)) {
      throw new IagestionApiError(
        `Error de red al llamar a ${path}: ${err.message}`,
        { servicio, raw: err }
      );
    }
    throw err;
  }

  if (status < 200 || status >= 300) {
    throw new IagestionApiError(
      `Error HTTP ${status} al llamar a ${path}: ${extractMessage(data) ?? "sin detalle"}`,
      { servicio, httpStatus: status, raw: data }
    );
  }

  const bizError = businessError(data);
  if (bizError) {
    throw new IagestionApiError(
      `iagestión devolvió un error de negocio en ${path}: ${bizError}`,
      { servicio, httpStatus: status, raw: data }
    );
  }

  return data;
}
