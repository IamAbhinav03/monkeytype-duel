FROM node:22.21.0-alpine AS base

# Install pnpm
RUN npm install -g pnpm@9.6.0

WORKDIR /app/user-handler

# Copy all files
COPY user-handler ./

# Install dependencies
RUN pnpm install --no-frozen-lockfile

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

# Create logs directory
RUN mkdir -p logs

EXPOSE 3006

CMD ["node", "dist/server.js"]
