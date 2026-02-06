import express, { Application } from "express";
import cors from "cors";
import config from "./config.js";
import logger from "./utils/logger.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import { getHealth } from "./controllers/health.controller.js";
import { UserController } from "./controllers/user.controller.js";
import { EventUserController } from "./controllers/event-user.controller.js";
import { VERSION } from "./version.js";

export function createApp(): Application {
  const app: Application = express();

  // Middleware
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // Initialize controllers
  const userController = new UserController();
  const eventUserController = new EventUserController();

  // Routes
  app.get("/", (req, res) => {
    res.json({
      service: "user-handler",
      version: VERSION,
      status: "running",
    });
  });

  app.get("/health", getHealth);

  // User routes
  app.get("/api/users/:userId", userController.getUser.bind(userController));
  app.post("/api/users", userController.createUser.bind(userController));
  app.put("/api/users/:userId", userController.updateUser.bind(userController));
  app.delete(
    "/api/users/:userId",
    userController.deleteUser.bind(userController),
  );

  // Event user routes (specific routes before parameterized routes)
  app.post(
    "/api/event-users/bulk",
    eventUserController.bulkAddUsers.bind(eventUserController),
  );
  app.get(
    "/api/event-users",
    eventUserController.getAllUsers.bind(eventUserController),
  );
  app.get(
    "/api/event-users/:otp",
    eventUserController.getUser.bind(eventUserController),
  );
  app.post(
    "/api/event-users/:otp",
    eventUserController.addUser.bind(eventUserController),
  );
  app.delete(
    "/api/event-users/:otp",
    eventUserController.deleteUser.bind(eventUserController),
  );

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
