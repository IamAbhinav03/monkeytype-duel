import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../app.js";
import type { Application } from "express";
import fs from "fs/promises";
import path from "path";

const TEST_DB_PATH = path.join(process.cwd(), "data", "event-users.json");

describe("Event User API Routes", () => {
  let app: Application;

  beforeEach(async () => {
    app = createApp();
    // Clear the database before each test
    await fs.mkdir(path.dirname(TEST_DB_PATH), { recursive: true });
    await fs.writeFile(TEST_DB_PATH, JSON.stringify({}, null, 2));
  });

  afterEach(async () => {
    // Clean up test database
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("GET /api/event-users/:otp", () => {
    it("should return 400 for invalid OTP format (not 6 digits)", async () => {
      const request = await import("supertest");
      const response = await request.default(app).get("/api/event-users/12345");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Valid 6-digit OTP is required");
    });

    it("should return 400 for non-numeric OTP", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .get("/api/event-users/abcdef");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Valid 6-digit OTP is required");
    });

    it("should return 404 when user does not exist", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .get("/api/event-users/123456");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("User not found");
    });

    it("should return user data when user exists", async () => {
      const request = await import("supertest");
      const testUser = {
        "user-full-name": "John Doe",
        "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
        "preferred-theme": "dark",
        wpm: 85,
        accuracy: 95.5,
        raw: 90,
        "user-email": "john@example.com",
      };

      // Add user first
      await fs.writeFile(
        TEST_DB_PATH,
        JSON.stringify({ "123456": testUser }, null, 2),
      );

      const response = await request
        .default(app)
        .get("/api/event-users/123456");

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(testUser);
    });
  });

  describe("POST /api/event-users/:otp", () => {
    it("should return 400 for invalid OTP format", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .post("/api/event-users/12345")
        .send({
          "user-full-name": "John Doe",
          "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
          "preferred-theme": "dark",
          wpm: 85,
          accuracy: 95.5,
          raw: 90,
          "user-email": "john@example.com",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Valid 6-digit OTP is required");
    });

    it("should return 400 for invalid user data (missing fields)", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .post("/api/event-users/123456")
        .send({
          "user-full-name": "John Doe",
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid user data");
      expect(response.body.details).toBeDefined();
    });

    it("should return 400 for invalid email format", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .post("/api/event-users/123456")
        .send({
          "user-full-name": "John Doe",
          "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
          "preferred-theme": "dark",
          wpm: 85,
          accuracy: 95.5,
          raw: 90,
          "user-email": "invalid-email",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid user data");
    });

    it("should successfully add a new user", async () => {
      const request = await import("supertest");
      const testUser = {
        "user-full-name": "John Doe",
        "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
        "preferred-theme": "dark",
        wpm: 85,
        accuracy: 95.5,
        raw: 90,
        "user-email": "john@example.com",
      };

      const response = await request
        .default(app)
        .post("/api/event-users/123456")
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual(testUser);

      // Verify user was saved to database
      const dbContent = await fs.readFile(TEST_DB_PATH, "utf-8");
      const db = JSON.parse(dbContent);
      expect(db["123456"]).toEqual(testUser);
    });

    it("should overwrite existing user with same OTP", async () => {
      const request = await import("supertest");
      const firstUser = {
        "user-full-name": "John Doe",
        "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
        "preferred-theme": "dark",
        wpm: 85,
        accuracy: 95.5,
        raw: 90,
        "user-email": "john@example.com",
      };

      const secondUser = {
        "user-full-name": "Jane Smith",
        "user-uuid": "660e8400-e29b-41d4-a716-446655440001",
        "preferred-theme": "light",
        wpm: 92,
        accuracy: 97.2,
        raw: 95,
        "user-email": "jane@example.com",
      };

      // Add first user
      await request
        .default(app)
        .post("/api/event-users/123456")
        .send(firstUser);

      // Add second user with same OTP
      const response = await request
        .default(app)
        .post("/api/event-users/123456")
        .send(secondUser);

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual(secondUser);

      // Verify database has second user
      const dbContent = await fs.readFile(TEST_DB_PATH, "utf-8");
      const db = JSON.parse(dbContent);
      expect(db["123456"]).toEqual(secondUser);
    });
  });

  describe("DELETE /api/event-users/:otp", () => {
    it("should return 400 for invalid OTP format", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .delete("/api/event-users/12345");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Valid 6-digit OTP is required");
    });

    it("should return 404 when user does not exist", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .delete("/api/event-users/123456");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("User not found");
    });

    it("should successfully delete an existing user", async () => {
      const request = await import("supertest");
      const testUser = {
        "user-full-name": "John Doe",
        "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
        "preferred-theme": "dark",
        wpm: 85,
        accuracy: 95.5,
        raw: 90,
        "user-email": "john@example.com",
      };

      // Add user first
      await fs.writeFile(
        TEST_DB_PATH,
        JSON.stringify({ "123456": testUser }, null, 2),
      );

      const response = await request
        .default(app)
        .delete("/api/event-users/123456");

      expect(response.status).toBe(204);

      // Verify user was removed from database
      const dbContent = await fs.readFile(TEST_DB_PATH, "utf-8");
      const db = JSON.parse(dbContent);
      expect(db["123456"]).toBeUndefined();
    });
  });

  describe("POST /api/event-users/bulk", () => {
    it("should return 400 for invalid bulk data format", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .post("/api/event-users/bulk")
        .send({
          "12345": {
            // Invalid OTP (not 6 digits)
            "user-full-name": "John Doe",
            "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
            "preferred-theme": "dark",
            wpm: 85,
            accuracy: 95.5,
            raw: 90,
            "user-email": "john@example.com",
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid bulk data");
    });

    it("should return 400 when any user has invalid data", async () => {
      const request = await import("supertest");
      const response = await request
        .default(app)
        .post("/api/event-users/bulk")
        .send({
          "123456": {
            "user-full-name": "John Doe",
            "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
            "preferred-theme": "dark",
            wpm: 85,
            accuracy: 95.5,
            raw: 90,
            "user-email": "invalid-email", // Invalid email
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid bulk data");
    });

    it("should successfully add multiple users", async () => {
      const request = await import("supertest");
      const bulkUsers = {
        "123456": {
          "user-full-name": "John Doe",
          "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
          "preferred-theme": "dark",
          wpm: 85,
          accuracy: 95.5,
          raw: 90,
          "user-email": "john@example.com",
        },
        "789012": {
          "user-full-name": "Jane Smith",
          "user-uuid": "660e8400-e29b-41d4-a716-446655440001",
          "preferred-theme": "light",
          wpm: 92,
          accuracy: 97.2,
          raw: 95,
          "user-email": "jane@example.com",
        },
        "345678": {
          "user-full-name": "Bob Johnson",
          "user-uuid": "770e8400-e29b-41d4-a716-446655440002",
          "preferred-theme": "dark",
          wpm: 78,
          accuracy: 93.0,
          raw: 82,
          "user-email": "bob@example.com",
        },
      };

      const response = await request
        .default(app)
        .post("/api/event-users/bulk")
        .send(bulkUsers);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Added 3 users");

      // Verify all users were saved to database
      const dbContent = await fs.readFile(TEST_DB_PATH, "utf-8");
      const db = JSON.parse(dbContent);
      expect(db["123456"]).toEqual(bulkUsers["123456"]);
      expect(db["789012"]).toEqual(bulkUsers["789012"]);
      expect(db["345678"]).toEqual(bulkUsers["345678"]);
    });

    it("should merge with existing users when bulk adding", async () => {
      const request = await import("supertest");
      const existingUser = {
        "user-full-name": "Existing User",
        "user-uuid": "880e8400-e29b-41d4-a716-446655440003",
        "preferred-theme": "dark",
        wpm: 70,
        accuracy: 90.0,
        raw: 75,
        "user-email": "existing@example.com",
      };

      // Add existing user
      await fs.writeFile(
        TEST_DB_PATH,
        JSON.stringify({ "111111": existingUser }, null, 2),
      );

      const newUsers = {
        "123456": {
          "user-full-name": "John Doe",
          "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
          "preferred-theme": "dark",
          wpm: 85,
          accuracy: 95.5,
          raw: 90,
          "user-email": "john@example.com",
        },
      };

      const response = await request
        .default(app)
        .post("/api/event-users/bulk")
        .send(newUsers);

      expect(response.status).toBe(201);

      // Verify both old and new users exist
      const dbContent = await fs.readFile(TEST_DB_PATH, "utf-8");
      const db = JSON.parse(dbContent);
      expect(db["111111"]).toEqual(existingUser);
      expect(db["123456"]).toEqual(newUsers["123456"]);
    });
  });

  describe("GET /api/event-users", () => {
    it("should return empty object when no users exist", async () => {
      const request = await import("supertest");
      const response = await request.default(app).get("/api/event-users");

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({});
    });

    it("should return all users in the database", async () => {
      const request = await import("supertest");
      const testUsers = {
        "123456": {
          "user-full-name": "John Doe",
          "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
          "preferred-theme": "dark",
          wpm: 85,
          accuracy: 95.5,
          raw: 90,
          "user-email": "john@example.com",
        },
        "789012": {
          "user-full-name": "Jane Smith",
          "user-uuid": "660e8400-e29b-41d4-a716-446655440001",
          "preferred-theme": "light",
          wpm: 92,
          accuracy: 97.2,
          raw: 95,
          "user-email": "jane@example.com",
        },
      };

      // Add users to database
      await fs.writeFile(TEST_DB_PATH, JSON.stringify(testUsers, null, 2));

      const response = await request.default(app).get("/api/event-users");

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(testUsers);
    });

    it("should return updated data after modifications", async () => {
      const request = await import("supertest");

      // Add a user
      const user1 = {
        "user-full-name": "John Doe",
        "user-uuid": "550e8400-e29b-41d4-a716-446655440000",
        "preferred-theme": "dark",
        wpm: 85,
        accuracy: 95.5,
        raw: 90,
        "user-email": "john@example.com",
      };
      await request.default(app).post("/api/event-users/123456").send(user1);

      // Get all users
      let response = await request.default(app).get("/api/event-users");
      expect(Object.keys(response.body.data)).toHaveLength(1);

      // Add another user
      const user2 = {
        "user-full-name": "Jane Smith",
        "user-uuid": "660e8400-e29b-41d4-a716-446655440001",
        "preferred-theme": "light",
        wpm: 92,
        accuracy: 97.2,
        raw: 95,
        "user-email": "jane@example.com",
      };
      await request.default(app).post("/api/event-users/789012").send(user2);

      // Get all users again
      response = await request.default(app).get("/api/event-users");
      expect(Object.keys(response.body.data)).toHaveLength(2);

      // Delete a user
      await request.default(app).delete("/api/event-users/123456");

      // Get all users one more time
      response = await request.default(app).get("/api/event-users");
      expect(Object.keys(response.body.data)).toHaveLength(1);
      expect(response.body.data["789012"]).toEqual(user2);
    });
  });
});
