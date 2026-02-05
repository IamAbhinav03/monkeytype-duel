FROM node:24.11.0-alpine3.22 AS builder

WORKDIR /app

# Copy root workspace files
COPY ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "./"]

# Copy packages
COPY packages packages

# Copy tribes-server source
COPY tribes-server tribes-server

# Install dependencies and build
RUN npm i -g pnpm && \
    pnpm i --frozen-lockfile && \
    npm run build-tribes

# Prepare production files (using pnpm deploy if possible, otherwise manual copy)
# Since tribes-server is part of the workspace, we try to use pnpm deploy if it works,
# but a simpler approach for now to match backend style is to grab what we built.
# However, backend uses `pnpm deploy`. Let's try to mimic that structure but for tribes-server.
RUN pnpm deploy --filter @monkeytype/tribes-server --prod /prod/tribes-server

# ---------------------------------
# Target Image
FROM node:24.11.0-alpine3.22

WORKDIR /app/tribes-server

# Copy from builder
# Copy production dependencies from the deployed directory (clean prod deps)
COPY --from=builder /prod/tribes-server/node_modules ./node_modules
# Copy compiled artifacts from the build directory (guaranteed to be fresh)
COPY --from=builder /app/tribes-server/dist ./dist
# Copy package.json from deployed directory
COPY --from=builder /prod/tribes-server/package.json ./package.json

# Create logs directory
RUN mkdir logs

# Set ownership to node user
RUN chown -R node:node /app/tribes-server

# Environment defaults (can be overridden in compose)
ENV PORT=3005
ENV MODE=prod

EXPOSE 3005

USER node

CMD ["node", "dist/server.js"]
