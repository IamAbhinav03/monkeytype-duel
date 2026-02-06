FROM node:22.21.0-alpine AS base

# Install pnpm
RUN npm install -g pnpm@9.6.0

WORKDIR /app/user-handler

# Copy package files first
COPY user-handler/package.json ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY user-handler/src ./src
COPY user-handler/tsconfig.json ./
COPY user-handler/.oxlintrc.json ./

# Build the application
RUN pnpm build

# Production stage
FROM node:22.21.0-alpine AS production

RUN npm install -g pnpm@9.6.0

WORKDIR /app/user-handler

# Copy package files
COPY user-handler/package.json ./

# Install production dependencies only
RUN pnpm install --no-frozen-lockfile --prod --ignore-scripts

# Copy built files from base stage
COPY --from=base /app/user-handler/dist ./dist

# Create logs and data directories
RUN mkdir -p logs data

EXPOSE 3006

CMD ["node", "dist/server.js"]
