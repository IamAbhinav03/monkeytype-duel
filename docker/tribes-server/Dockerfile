FROM node:24.11.0-alpine3.22 AS builder

WORKDIR /app

# Copy package files
COPY ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "./"]
COPY packages packages
COPY tribes-server tribes-server

# Install pnpm and build
RUN npm i -g pnpm && \
    pnpm i --frozen-lockfile && \
    npm run build

# Deploy (install all non-dev dependencies in a single node_modules folder)
RUN pnpm deploy --filter @monkeytype/tribes-server --prod /prod/tribes-server

#---------------------------------

# Target image
FROM node:24.11.0-alpine3.22

# Copy to target
COPY --from=builder /prod/tribes-server/node_modules /app/tribes-server/node_modules
COPY --from=builder /prod/tribes-server/dist /app/tribes-server/dist
COPY --from=builder /app/tribes-server/duel-otp.json /app/tribes-server/duel-otp.json

# Set working directory
WORKDIR /app/tribes-server

# Create logs directory
RUN mkdir -p /app/tribes-server/logs

# Set environment variables
ENV PORT=3005
ENV MODE=prod
ENV TRIBES_VERSION=1.0.0

EXPOSE 3005
USER node

CMD ["node", "dist/server.js"]
