FROM node:22.21.0-alpine AS base

# Install pnpm
RUN npm install -g pnpm@9.6.0

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all packages
COPY packages ./packages
COPY user-handler ./user-handler

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the user-handler
WORKDIR /app/user-handler
RUN pnpm build

# Production stage
FROM node:22.21.0-alpine AS production

RUN npm install -g pnpm@9.6.0

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files for all workspace packages
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/oxlint-config/package.json ./packages/oxlint-config/
COPY packages/tsup-config/package.json ./packages/tsup-config/
COPY user-handler/package.json ./user-handler/

# Copy built packages from base stage
COPY --from=base /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=base /app/packages/schemas/src ./packages/schemas/src

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built files
COPY --from=base /app/user-handler/dist ./user-handler/dist

WORKDIR /app/user-handler

# Create logs directory
RUN mkdir -p logs

EXPOSE 3006

CMD ["node", "dist/server.js"]
