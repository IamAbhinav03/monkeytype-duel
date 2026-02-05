# User Handler Microservice

A microservice for handling user-related operations in the Monkeytype Duel monorepo.

## Overview

The User Handler service provides a RESTful API for managing user data. It's built with Express.js and TypeScript, following the same architectural patterns as other services in the monorepo.

## Features

- **User Management**: CRUD operations for user entities
- **Health Checks**: Built-in health check endpoint for monitoring
- **Logging**: Structured logging with Winston
- **Error Handling**: Centralized error handling middleware
- **Type Safety**: Full TypeScript support

## API Endpoints

### Health Check
- `GET /health` - Returns service health status

### User Operations
- `GET /api/users/:userId` - Get user by ID
- `POST /api/users` - Create a new user
- `PUT /api/users/:userId` - Update user
- `DELETE /api/users/:userId` - Delete user

## Development

### Prerequisites
- Node.js 22.21.0 or 24.11.0
- pnpm 9.6.0

### Installation

From the root of the monorepo:

```bash
pnpm install
```

### Running Locally

```bash
# From the root
pnpm dev-user-handler

# Or from the user-handler directory
pnpm dev
```

The service will start on port 3006 by default.

### Building

```bash
# From the root
pnpm build-user-handler

# Or from the user-handler directory
pnpm build
```

### Running with Docker

```bash
# From the user-handler directory
pnpm docker

# Or using docker-compose directly
docker compose -f docker/compose.yml up
```

## Configuration

The service can be configured using environment variables:

- `PORT` - Server port (default: 3006)
- `MODE` - Environment mode: "dev" or "prod" (default: "dev")
- `USER_HANDLER_VERSION` - Service version (default: "1.0.0")
- `CORS_ORIGIN` - CORS origin (default: "*")
- `LOG_LEVEL` - Logging level (default: "info")

## Architecture

```
user-handler/
├── src/
│   ├── controllers/     # Request handlers
│   ├── services/        # Business logic
│   ├── middlewares/     # Express middlewares
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── app.ts          # Express app setup
│   ├── server.ts       # Server entry point
│   ├── config.ts       # Configuration
│   └── version.ts      # Version constant
├── docker/             # Docker configuration
├── logs/              # Log files
└── dist/              # Compiled output
```

## Testing

```bash
pnpm test
```

## Linting

```bash
pnpm lint
```

## Future Enhancements

- Database integration (MongoDB/PostgreSQL)
- Authentication and authorization
- Input validation with Zod
- Rate limiting
- Caching layer
- Comprehensive test coverage
- API documentation with OpenAPI/Swagger
