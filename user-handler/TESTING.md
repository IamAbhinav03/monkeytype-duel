# Event User API Tests

Comprehensive test suite for the Event User API endpoints.

## Installation

Before running tests, install dependencies:

```bash
pnpm install
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run a specific test file
pnpm test event-user.controller.test.ts
```

## Test Coverage

The test suite covers all 5 event user API endpoints:

### 1. GET /api/event-users/:otp
- ✅ Invalid OTP format validation (not 6 digits)
- ✅ Non-numeric OTP validation
- ✅ User not found (404)
- ✅ Successfully retrieve existing user

### 2. POST /api/event-users/:otp
- ✅ Invalid OTP format validation
- ✅ Missing required fields validation
- ✅ Invalid email format validation
- ✅ Successfully add new user
- ✅ Overwrite existing user with same OTP

### 3. DELETE /api/event-users/:otp
- ✅ Invalid OTP format validation
- ✅ User not found (404)
- ✅ Successfully delete existing user

### 4. POST /api/event-users/bulk
- ✅ Invalid bulk data format validation
- ✅ Invalid user data in bulk operation
- ✅ Successfully add multiple users
- ✅ Merge with existing users

### 5. GET /api/event-users
- ✅ Return empty object when no users exist
- ✅ Return all users in database
- ✅ Return updated data after modifications

## Test Structure

Each test suite:
1. **beforeEach**: Clears the test database before each test
2. **afterEach**: Cleans up the test database file
3. **Test cases**: Cover success scenarios, validation errors, and edge cases

## Database Isolation

Tests use the same database path as the application (`data/event-users.json`), but:
- The database is cleared before each test
- The database is cleaned up after each test
- Tests are isolated from each other

## Dependencies

- **vitest**: Test runner
- **supertest**: HTTP assertion library for testing Express apps
- **@types/supertest**: TypeScript types for supertest
