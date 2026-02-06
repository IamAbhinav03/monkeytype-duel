# User Handler Microservice - Setup Summary

## Overview
A new microservice called `user-handler` has been successfully created in the monorepo following the same architectural pattern as the `tribes-server`.

## What Was Created

### Directory Structure
```
user-handler/
├── src/
│   ├── controllers/
│   │   ├── health.controller.ts    # Health check endpoint
│   │   └── user.controller.ts      # User CRUD operations
│   ├── services/
│   │   └── user.service.ts         # Business logic layer
│   ├── middlewares/
│   │   └── error-handler.ts        # Error handling middleware
│   ├── types/
│   │   └── user.types.ts           # TypeScript type definitions
│   ├── utils/
│   │   └── logger.ts               # Winston logger configuration
│   ├── app.ts                      # Express app setup
│   ├── server.ts                   # Server entry point
│   ├── config.ts                   # Configuration management
│   └── version.ts                  # Version constant
├── docker/
│   ├── Dockerfile                  # Docker build configuration
│   └── compose.yml                 # Docker Compose for local dev
├── logs/                           # Log files directory
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── .oxlintrc.json                  # Linting configuration
├── .gitignore                      # Git ignore rules
└── README.md                       # Documentation

```

### Configuration Updates

1. **pnpm-workspace.yaml** - Added `user-handler` to workspace packages
2. **package.json (root)** - Added scripts:
   - `build-user-handler`
   - `dev-user-handler`
   - `start-user-handler`
3. **docker/docker-compose.yml** - Added `monkeytype-user-handler` service
4. **docker/user-handler/Dockerfile** - Created multi-stage build configuration

## Features

### API Endpoints

- `GET /` - Service info
- `GET /health` - Health check
- `GET /api/users/:userId` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:userId` - Update user
- `DELETE /api/users/:userId` - Delete user

### Architecture

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and data management
- **Middlewares**: Error handling and request processing
- **Types**: TypeScript type definitions
- **Utils**: Logging and utilities

### Configuration

Default environment variables:
- `PORT=3006`
- `MODE=dev`
- `USER_HANDLER_VERSION=1.0.0`
- `CORS_ORIGIN=*`
- `LOG_LEVEL=info`

## Next Steps

### 1. Install Dependencies

**Note**: You need Node.js version 22.21.0 or 24.11.0. Your current version (v25.6.0) is not compatible.

Either:
- Switch to a compatible Node version using nvm: `nvm use 22.21.0`
- Or update the `engines.node` field in package.json files

Then run:
```bash
pnpm install
```

### 2. Run the Service

**Development mode:**
```bash
# From root
pnpm dev-user-handler

# Or from user-handler directory
cd user-handler
pnpm dev
```

**Production build:**
```bash
# From root
pnpm build-user-handler
pnpm start-user-handler
```

**With Docker:**
```bash
# From user-handler directory
pnpm docker

# Or from root with docker-compose
cd docker
docker-compose up monkeytype-user-handler
```

### 3. Test the Service

Once running, test the endpoints:

```bash
# Health check
curl http://localhost:3006/health

# Create a user
curl -X POST http://localhost:3006/api/users \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com"}'

# Get user (use the ID from create response)
curl http://localhost:3006/api/users/{userId}
```

## Future Enhancements

The service is currently using in-memory storage. Consider adding:

1. **Database Integration**
   - MongoDB (to match backend)
   - PostgreSQL
   - Redis for caching

2. **Authentication & Authorization**
   - JWT tokens
   - Role-based access control

3. **Validation**
   - Zod schemas for request validation
   - Input sanitization

4. **Testing**
   - Unit tests with Vitest
   - Integration tests
   - E2E tests

5. **Monitoring & Observability**
   - Metrics (Prometheus)
   - Distributed tracing
   - APM integration

6. **API Documentation**
   - OpenAPI/Swagger spec
   - Auto-generated docs

7. **Rate Limiting & Security**
   - Rate limiting middleware
   - Helmet.js for security headers
   - CORS configuration

## Troubleshooting

### Lint Errors

Some lint errors are expected until dependencies are installed:
- Module not found errors will resolve after `pnpm install`
- The TypeScript config extends from workspace packages

### Port Conflicts

If port 3006 is in use, change it via environment variable:
```bash
PORT=3007 pnpm dev
```

## Integration with Other Services

The user-handler can be integrated with:
- **Backend** - Share user data
- **Tribes Server** - User management for tribes
- **Frontend** - User profile management

Consider adding inter-service communication via:
- REST APIs
- Message queues (RabbitMQ, Redis)
- gRPC for performance-critical operations
