# User Handler Service Architecture

## Service Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Handler Service                      │
│                         (Port 3006)                          │
└─────────────────────────────────────────────────────────────┘

## Request Flow

```
Client Request
     │
     ▼
┌─────────────────┐
│  Express App    │
│  (app.ts)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Middlewares    │
│  - CORS         │
│  - Body Parser  │
│  - Logger       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Controllers    │
│  - Health       │
│  - User         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Services       │
│  - UserService  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Data Layer     │
│  (In-Memory)    │
│  Map<id, User>  │
└─────────────────┘
```

## Component Breakdown

### 1. Entry Point (server.ts)
- Starts Express server
- Handles graceful shutdown
- Listens on configured port

### 2. Application Setup (app.ts)
- Configures Express middleware
- Defines routes
- Sets up error handling

### 3. Controllers
**HealthController**
- GET /health → Service health status

**UserController**
- GET /api/users/:userId → Get user
- POST /api/users → Create user
- PUT /api/users/:userId → Update user
- DELETE /api/users/:userId → Delete user

### 4. Services
**UserService**
- Business logic for user operations
- Data validation
- In-memory storage (Map)

### 5. Middlewares
**Error Handler**
- Catches and formats errors
- Logs error details
- Returns appropriate HTTP responses

### 6. Utilities
**Logger (Winston)**
- File logging (error.log, combined.log)
- Console logging (dev mode)
- Structured JSON logs

### 7. Configuration (config.ts)
- Environment variable management
- Default values
- Type-safe configuration

## Data Model

```typescript
User {
  id: string           // UUID
  username: string
  email: string
  createdAt: Date
  updatedAt: Date
}
```

## Environment Configuration

```
PORT=3006
MODE=dev|prod
USER_HANDLER_VERSION=1.0.0
CORS_ORIGIN=*
LOG_LEVEL=info|debug|error
```

## Integration Points

### With Other Services

```
┌──────────────┐         ┌──────────────┐
│   Frontend   │────────▶│ User Handler │
└──────────────┘         └──────┬───────┘
                                │
┌──────────────┐                │
│   Backend    │◀───────────────┘
└──────────────┘
        │
        ▼
┌──────────────┐
│   MongoDB    │
└──────────────┘

┌──────────────┐
│Tribes Server │
└──────────────┘
```

### Future Database Integration

```
UserService
     │
     ▼
┌─────────────────┐
│  Data Access    │
│  Layer (DAL)    │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│MongoDB │ │ Redis  │
│(Primary)│ │(Cache) │
└────────┘ └────────┘
```

## Deployment Architecture

```
┌────────────────────────────────────────────────┐
│              Docker Compose                     │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐           │
│  │   Frontend   │  │   Backend    │           │
│  │  (Port 8080) │  │  (Port 5005) │           │
│  └──────────────┘  └──────────────┘           │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐           │
│  │Tribes Server │  │ User Handler │           │
│  │  (Port 3005) │  │  (Port 3006) │  ◀── NEW  │
│  └──────────────┘  └──────────────┘           │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐           │
│  │   MongoDB    │  │    Redis     │           │
│  │ (Port 27017) │  │  (Port 6379) │           │
│  └──────────────┘  └──────────────┘           │
└────────────────────────────────────────────────┘
```

## Monorepo Structure

```
monkeytype-duel/
├── frontend/
├── backend/
├── tribes-server/
├── user-handler/          ◀── NEW MICROSERVICE
│   ├── src/
│   ├── docker/
│   ├── logs/
│   └── package.json
├── packages/
├── docker/
│   ├── backend/
│   ├── frontend/
│   ├── tribes-server/
│   └── user-handler/      ◀── NEW
└── package.json
```
