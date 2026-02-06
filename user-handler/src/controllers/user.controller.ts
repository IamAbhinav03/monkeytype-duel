import { Request, Response } from "express";
import { UserService } from "../services/user.service.js";
import logger from "../utils/logger.js";
import {
  CreateUserDtoSchema,
  UpdateUserDtoSchema,
} from "../types/user.types.js";

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const userIdParam = req.params["userId"];
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;

      if (userId === undefined || userId === null || userId === "") {
        res.status(400).json({ error: "User ID is required" });
        return;
      }

      const user = await this.userService.getUserById(userId);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({ data: user });
    } catch (error) {
      logger.error("Error getting user:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  }

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = CreateUserDtoSchema.safeParse(req.body);

      if (!parseResult.success) {
        res
          .status(400)
          .json({ error: "Invalid user data", details: parseResult.error });
        return;
      }

      const user = await this.userService.createUser(parseResult.data);

      res.status(201).json({ data: user });
    } catch (error) {
      logger.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const userIdParam = req.params["userId"];
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;

      if (userId === undefined || userId === null || userId === "") {
        res.status(400).json({ error: "User ID is required" });
        return;
      }

      const parseResult = UpdateUserDtoSchema.safeParse(req.body);

      if (!parseResult.success) {
        res
          .status(400)
          .json({ error: "Invalid user data", details: parseResult.error });
        return;
      }

      const user = await this.userService.updateUser(userId, parseResult.data);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({ data: user });
    } catch (error) {
      logger.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const userIdParam = req.params["userId"];
      const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;

      if (userId === undefined || userId === null || userId === "") {
        res.status(400).json({ error: "User ID is required" });
        return;
      }

      await this.userService.deleteUser(userId);

      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
}
