# syntax=docker/dockerfile:1

# --- Etapa 1: build (compila TypeScript, incluye devDependencies) ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Etapa 2: runtime (solo dependencias de producción + dist compilado) ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Usuario sin privilegios: el proceso Node no corre como root dentro del contenedor.
RUN addgroup -S mcp && adduser -S mcp -G mcp
USER mcp

ENV PORT=3000
EXPOSE 3000

# Falla el healthcheck si el servidor no responde en /health (ver src/httpServer.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Arranca siempre el transporte HTTP: es la variante pensada para quedar
# corriendo de forma persistente (stdio no tiene sentido en un contenedor
# desatendido, ya que necesita que un cliente MCP lance el proceso él mismo).
CMD ["node", "dist/httpServer.js"]
