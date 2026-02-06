# Event User API

REST API endpoints for managing event user data with OTP-based access.

## Endpoints

### 1. Get One User (by OTP)
```
GET /api/event-users/:otp
```
Returns the event user data for the given 6-digit OTP.

**Example:**
```bash
curl http://localhost:3006/api/event-users/123456
```

### 2. Add One User
```
POST /api/event-users/:otp
```
Adds a new event user with the given 6-digit OTP.

**Request Body:**
```json
{
  "user-full-name": "John Doe",
  "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
  "preferred-theme": "dark",
  "wpm": 85,
  "accuracy": 95.5,
  "raw": 90,
  "user-email": "john@example.com"
}
```

**Example:**
```bash
curl -X POST http://localhost:3006/api/event-users/123456 \
  -H "Content-Type: application/json" \
  -d '{"user-full-name":"John Doe","user-uuid":"550e8400-e29b-41d4-a716-446655440000","preferred-theme":"dark","wpm":85,"accuracy":95.5,"raw":90,"user-email":"john@example.com"}'
```

### 3. Delete One User (by OTP)
```
DELETE /api/event-users/:otp
```
Deletes the event user with the given 6-digit OTP.

**Example:**
```bash
curl -X DELETE http://localhost:3006/api/event-users/123456
```

### 4. Bulk Add Users
```
POST /api/event-users/bulk
```
Adds multiple event users at once.

**Request Body:**
```json
{
  "123456": {
    "user-full-name": "John Doe",
    "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
    "preferred-theme": "dark",
    "wpm": 85,
    "accuracy": 95.5,
    "raw": 90,
    "user-email": "john@example.com"
  },
  "789012": {
    "user-full-name": "Jane Smith",
    "user-uuid": "660e8400-e29b-41d4-a716-446655440001",
    "preferred-theme": "light",
    "wpm": 92,
    "accuracy": 97.2,
    "raw": 95,
    "user-email": "jane@example.com"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3006/api/event-users/bulk \
  -H "Content-Type: application/json" \
  -d '{"123456":{"user-full-name":"John Doe","user-uuid":"550e8400-e29b-41d4-a716-446655440000","preferred-theme":"dark","wpm":85,"accuracy":95.5,"raw":90,"user-email":"john@example.com"}}'
```

### 5. Bulk View Users
```
GET /api/event-users
```
Returns all event users in the database.

**Example:**
```bash
curl http://localhost:3006/api/event-users
```

## Data Storage

Event user data is stored in a JSON file at `data/event-users.json`. The file structure is:

```json
{
  "123456": {
    "user-full-name": "John Doe",
    "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
    "preferred-theme": "dark",
    "wpm": 85,
    "accuracy": 95.5,
    "raw": 90,
    "user-email": "john@example.com"
  }
}
```

## Validation

- OTP must be exactly 6 digits (numeric)
- Email must be a valid email format
- All required fields must be present in the request body
