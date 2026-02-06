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

# Copy packages
COPY packages ./packages
COPY user-handler/package.json ./user-handler/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY --from=base /app/user-handler/dist ./user-handler/dist

WORKDIR /app/user-handler

# Create logs directory
RUN mkdir -p logs

EXPOSE 3006

CMD ["node", "dist/server.js"]
