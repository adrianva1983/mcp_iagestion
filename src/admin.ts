#!/usr/bin/env node
/**
 * CLI de administración de usuarios del servidor HTTP multiusuario.
 *
 *   node dist/admin.js add "Ana Pérez" --confirm-code           alta, código de confirmación autogenerado
 *   node dist/admin.js add "Ana Pérez" --confirm-code 4821      alta, código propio elegido a mano
 *   node dist/admin.js list                                     lista usuarios
 *   node dist/admin.js rotate <id|nombre>                       genera un token de acceso nuevo (invalida el anterior)
 *   node dist/admin.js set-token <id|nombre>                    cambia el token de iagestión del usuario
 *   node dist/admin.js set-confirm-code <id|nombre>              autogenera el código de confirmación
 *   node dist/admin.js set-confirm-code <id|nombre> <código>     fija el código de confirmación a mano
 *   node dist/admin.js clear-confirm-code <id|nombre>            quita el código propio (usa el compartido)
 *   node dist/admin.js revoke <id|nombre>                        baja: el usuario deja de poder conectar
 *
 * En Docker: docker compose exec mcp node dist/admin.js add "Ana Pérez" --confirm-code
 * El token de iagestión también puede llegar por stdin (echo "<token>" | ... add Ana)
 * o por la variable IAGESTION_USER_TOKEN, para automatizar altas sin dejarlo en el historial.
 *
 * El código de confirmación es opcional: es lo que ese usuario debe incluir en
 * "confirmacion_humana" al superar el umbral de acciones destructivas
 * (actualizar/eliminar en cadena). Sin él, usa el secreto compartido
 * IAGESTION_CONFIRM_TOKEN del servidor. Se muestra en claro UNA sola vez al
 * crearlo o cambiarlo (autogenerado o no); luego solo se guarda su hash — no
 * se puede recuperar, solo volver a cambiar.
 */

import { randomBytes } from "node:crypto";
import {
  TOKEN_TTL_DAYS_DEFAULT,
  USERS_FILE,
  defaultExpiryIso,
  encryptApiToken,
  generateAccessToken,
  generateConfirmCode,
  hashAccessToken,
  hashConfirmCode,
  readStore,
  writeStore,
  type UserRecord,
} from "./users.js";

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Lee un secreto: de IAGESTION_USER_TOKEN, de stdin si no es TTY, o por prompt sin eco. */
async function readSecret(prompt: string): Promise<string> {
  const fromEnv = process.env.IAGESTION_USER_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8").trim();
  }

  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value.trim());
          return;
        }
        if (char === "\u0003") process.exit(130); // Ctrl+C
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

/** Saca "--dias N" de la lista de argumentos (usado por add/rotate para fijar una caducidad distinta de la por defecto). */
function extractDiasFlag(args: string[]): { rest: string[]; dias?: number } {
  const idx = args.findIndex((a) => a === "--dias");
  if (idx === -1) return { rest: args };
  const dias = Number(args[idx + 1]);
  if (!Number.isFinite(dias) || dias <= 0) fail('"--dias" debe ir seguido de un número de días positivo.');
  return { rest: [...args.slice(0, idx), ...args.slice(idx + 2)], dias };
}

/**
 * Saca "--confirm-code" (con o sin valor) de la lista de argumentos, usado por add.
 * Sin valor detrás (o seguido de otro flag) => autogenerar; con valor => usar ese.
 */
function extractConfirmCodeFlag(args: string[]): { rest: string[]; mode: "none" | "auto" | "manual"; code?: string } {
  const idx = args.findIndex((a) => a === "--confirm-code");
  if (idx === -1) return { rest: args, mode: "none" };
  const next = args[idx + 1];
  if (next === undefined || next.startsWith("--")) {
    return { rest: [...args.slice(0, idx), ...args.slice(idx + 1)], mode: "auto" };
  }
  return { rest: [...args.slice(0, idx), ...args.slice(idx + 2)], mode: "manual", code: next };
}

function findUser(users: UserRecord[], ref: string | undefined): UserRecord {
  if (!ref) fail("Indica el id o el nombre del usuario.");
  const matches = users.filter((u) => u.id === ref || u.nombre.toLowerCase() === ref.toLowerCase());
  if (matches.length === 0) fail(`No existe ningún usuario "${ref}". Usa "list" para ver los ids.`);
  if (matches.length > 1) fail(`"${ref}" coincide con varios usuarios; usa el id.`);
  return matches[0]!;
}

function printAccess(user: UserRecord, token: string, freshConfirmCode?: string): void {
  const base = (process.env.PUBLIC_BASE_URL ?? "https://TU_DOMINIO").replace(/\/+$/, "");
  console.log(`\nUsuario: ${user.nombre} (id ${user.id})`);
  console.log("Token de acceso (se muestra UNA sola vez, no se puede recuperar):");
  console.log(`  ${token}`);
  console.log(`Caduca: ${user.expiresAt.slice(0, 10)} (renuévalo antes con "admin rotate" si sigue en uso)`);
  console.log(
    user.confirmCodeHash
      ? "Confirmación humana: código propio configurado."
      : "Confirmación humana: usa el código compartido del servidor (IAGESTION_CONFIRM_TOKEN)."
  );
  if (freshConfirmCode) {
    console.log("  Código (se muestra UNA sola vez, no se puede recuperar):");
    console.log(`    ${freshConfirmCode}`);
  }
  console.log("URL para el conector remoto (clientes que solo admiten pegar una URL):");
  console.log(`  ${base}/mcp/${token}`);
  console.log("O, si el cliente admite cabeceras (evita dejar el token en los logs): URL + Authorization: Bearer <token>:");
  console.log(`  ${base}/mcp`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const store = readStore();

  switch (command) {
    case "add": {
      const { rest: restDias, dias } = extractDiasFlag(args);
      const { rest, mode, code: explicitCode } = extractConfirmCodeFlag(restDias);
      const nombre = rest.join(" ").trim();
      if (!nombre) fail('Uso: add "Nombre del usuario" [--dias N] [--confirm-code [X]]');
      if (store.users.some((u) => u.nombre.toLowerCase() === nombre.toLowerCase())) {
        fail(`Ya existe un usuario llamado "${nombre}".`);
      }
      const apiToken = await readSecret("Token M2M de iagestión de este usuario: ");
      if (!apiToken) fail("El token de iagestión no puede estar vacío.");

      const confirmCode = mode === "auto" ? generateConfirmCode() : mode === "manual" ? explicitCode : undefined;

      const accessToken = generateAccessToken();
      const user: UserRecord = {
        id: randomBytes(4).toString("hex"),
        nombre,
        accessHash: hashAccessToken(accessToken),
        apiTokenEnc: encryptApiToken(apiToken),
        createdAt: new Date().toISOString(),
        expiresAt: defaultExpiryIso(dias),
        lastUsedAt: null,
        confirmCodeHash: confirmCode ? hashConfirmCode(confirmCode) : undefined,
      };
      store.users.push(user);
      writeStore(store);
      console.log(`Usuario dado de alta en ${USERS_FILE}.`);
      if (!confirmCode) {
        console.log(
          'Aviso: sin código de confirmación, este usuario usará el código compartido del servidor ' +
            '(IAGESTION_CONFIRM_TOKEN) para confirmar acciones destructivas en cadena. ' +
            'Añádele uno propio luego con "admin set-confirm-code".'
        );
      }
      printAccess(user, accessToken, confirmCode);
      break;
    }

    case "list": {
      if (store.users.length === 0) {
        console.log("No hay usuarios dados de alta.");
        break;
      }
      const now = Date.now();
      for (const u of store.users) {
        const alta = u.createdAt.slice(0, 10);
        let expira = "nunca (token antiguo; usa \"rotate\" para activarle caducidad)";
        if (u.expiresAt) {
          const diasRestantes = Math.ceil((new Date(u.expiresAt).getTime() - now) / 86_400_000);
          const fecha = u.expiresAt.slice(0, 10);
          expira =
            diasRestantes < 0
              ? `CADUCADO (${fecha})`
              : diasRestantes <= 14
                ? `${fecha} (⚠ en ${diasRestantes} días)`
                : fecha;
        }
        const ultimoUso = u.lastUsedAt ? u.lastUsedAt.slice(0, 10) : "nunca";
        const confirmacion = u.confirmCodeHash ? "confirmación:propia" : "confirmación:compartida";
        console.log(`${u.id}  ${u.nombre}  alta:${alta}  expira:${expira}  último uso:${ultimoUso}  ${confirmacion}`);
      }
      break;
    }

    case "rotate": {
      const { rest, dias } = extractDiasFlag(args);
      const user = findUser(store.users, rest.join(" ").trim());
      const accessToken = generateAccessToken();
      user.accessHash = hashAccessToken(accessToken);
      user.expiresAt = defaultExpiryIso(dias);
      writeStore(store);
      console.log(`Token de acceso regenerado (válido ${dias ?? TOKEN_TTL_DAYS_DEFAULT} días); el anterior deja de funcionar.`);
      printAccess(user, accessToken);
      break;
    }

    case "set-token": {
      const user = findUser(store.users, args.join(" ").trim());
      const apiToken = await readSecret(`Nuevo token M2M de iagestión para ${user.nombre}: `);
      if (!apiToken) fail("El token de iagestión no puede estar vacío.");
      user.apiTokenEnc = encryptApiToken(apiToken);
      writeStore(store);
      console.log(`Token de iagestión actualizado para ${user.nombre}.`);
      break;
    }

    case "set-confirm-code": {
      // args[0] = nombre (se espera entrecomillado como UN argumento, igual que en el resto de comandos).
      // args[1], si viene, es el código a mano; sin él, se autogenera.
      const nombre = args[0]?.trim();
      const explicitCode = args[1];
      if (!nombre) fail('Uso: set-confirm-code "Nombre del usuario" [código]  (sin código, se autogenera uno)');
      const user = findUser(store.users, nombre);
      const code = explicitCode || generateConfirmCode();
      user.confirmCodeHash = hashConfirmCode(code);
      writeStore(store);
      console.log(`Código de confirmación humana actualizado para ${user.nombre}.`);
      if (!explicitCode) {
        console.log("Código autogenerado (se muestra UNA sola vez, no se puede recuperar):");
        console.log(`  ${code}`);
      }
      break;
    }

    case "clear-confirm-code": {
      const user = findUser(store.users, args.join(" ").trim());
      user.confirmCodeHash = undefined;
      writeStore(store);
      console.log(`Código de confirmación propio eliminado para ${user.nombre}; volverá a usar el código compartido.`);
      break;
    }

    case "revoke": {
      const user = findUser(store.users, args.join(" ").trim());
      store.users = store.users.filter((u) => u.id !== user.id);
      writeStore(store);
      console.log(`Usuario ${user.nombre} (id ${user.id}) dado de baja.`);
      break;
    }

    default:
      console.error(
        'Uso: admin <add "Nombre" [--dias N] [--confirm-code [X]] | list | rotate <usuario> [--dias N] | ' +
          'set-token <usuario> | set-confirm-code <usuario> [código] | clear-confirm-code <usuario> | revoke <usuario>>'
      );
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
