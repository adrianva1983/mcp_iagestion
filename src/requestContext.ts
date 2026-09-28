/**
 * Contexto por petición: quién está llamando y con qué token de iagestión.
 *
 * El transporte HTTP es multiusuario: cada usuario tiene su propio token M2M
 * de iagestión. Las tools llaman a callIagestion() sin conocer al usuario, así
 * que el token viaja en un AsyncLocalStorage que httpServer.ts abre alrededor
 * de cada petición (ver runWithUser). En stdio no hay contexto y client.ts usa
 * la variable de entorno IAGESTION_API_TOKEN como siempre.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface UserContext {
  /** Identificador estable del usuario (para logs, rate limit y freno destructivo). */
  userId: string;
  nombre: string;
  /** Token M2M de iagestión con el que se ejecutan las tools de esta petición. */
  apiToken: string | undefined;
}

const storage = new AsyncLocalStorage<UserContext>();

export function runWithUser<T>(user: UserContext, fn: () => T): T {
  return storage.run(user, fn);
}

export function currentUser(): UserContext | undefined {
  return storage.getStore();
}
