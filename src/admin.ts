#!/usr/bin/env node
/**
 * CLI de administración de usuarios del servidor HTTP multiusuario.
 *
 *   node dist/admin.js add "Ana Pérez"          alta (pide el token de iagestión sin eco)
 *   node dist/admin.js list                      lista usuarios
 *   node dist/admin.js rotate <id|nombre>        genera un token de acceso nuevo (invalida el anterior)
 *   node dist/admin.js set-token <id|nombre>     cambia el token de iagestión del usuario
 *   node dist/admin.js revoke <id|nombre>        baja: el usuario deja de poder conectar
 *
 * En Docker: docker compose exec mcp node dist/admin.js add "Ana Pérez"
 * El token de iagestión también puede llegar por stdin (echo "<token>" | ... add Ana)
 * o por la variable IAGESTION_USER_TOKEN, para automatizar altas sin dejarlo en el historial.
 */

import { randomBytes } from "node:crypto";
import {
  USERS_FILE,
  encryptApiToken,
  generateAccessToken,
  hashAccessToken,
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

function findUser(users: UserRecord[], ref: string | undefined): UserRecord {
  if (!ref) fail("Indica el id o el nombre del usuario.");
  const matches = users.filter((u) => u.id === ref || u.nombre.toLowerCase() === ref.toLowerCase());
  if (matches.length === 0) fail(`No existe ningún usuario "${ref}". Usa "list" para ver los ids.`);
  if (matches.length > 1) fail(`"${ref}" coincide con varios usuarios; usa el id.`);
  return matches[0]!;
}

function printAccess(user: UserRecord, token: string): void {
  const base = (process.env.PUBLIC_BASE_URL ?? "https://TU_DOMINIO").replace(/\/+$/, "");
  console.log(`\nUsuario: ${user.nombre} (id ${user.id})`);
  console.log("Token de acceso (se muestra UNA sola vez, no se puede recuperar):");
  console.log(`  ${token}`);
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
      const nombre = args.join(" ").trim();
      if (!nombre) fail('Uso: add "Nombre del usuario"');
      if (store.users.some((u) => u.nombre.toLowerCase() === nombre.toLowerCase())) {
        fail(`Ya existe un usuario llamado "${nombre}".`);
      }
      const apiToken = await readSecret("Token M2M de iagestión de este usuario: ");
      if (!apiToken) fail("El token de iagestión no puede estar vacío.");

      const accessToken = generateAccessToken();
      const user: UserRecord = {
        id: randomBytes(4).toString("hex"),
        nombre,
        accessHash: hashAccessToken(accessToken),
        apiTokenEnc: encryptApiToken(apiToken),
        createdAt: new Date().toISOString(),
      };
      store.users.push(user);
      writeStore(store);
      console.log(`Usuario dado de alta en ${USERS_FILE}.`);
      printAccess(user, accessToken);
      break;
    }

    case "list": {
      if (store.users.length === 0) {
        console.log("No hay usuarios dados de alta.");
        break;
      }
      for (const u of store.users) console.log(`${u.id}  ${u.nombre}  (alta ${u.createdAt.slice(0, 10)})`);
      break;
    }

    case "rotate": {
      const user = findUser(store.users, args.join(" ").trim());
      const accessToken = generateAccessToken();
      user.accessHash = hashAccessToken(accessToken);
      writeStore(store);
      console.log("Token de acceso regenerado; el anterior deja de funcionar.");
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

    case "revoke": {
      const user = findUser(store.users, args.join(" ").trim());
      store.users = store.users.filter((u) => u.id !== user.id);
      writeStore(store);
      console.log(`Usuario ${user.nombre} (id ${user.id}) dado de baja.`);
      break;
    }

    default:
      console.error('Uso: admin <add "Nombre" | list | rotate <usuario> | set-token <usuario> | revoke <usuario>>');
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
