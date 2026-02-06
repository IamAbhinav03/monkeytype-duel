import { Request, Response } from "express";
import { EventUserService } from "../services/event-user.service.js";
import logger from "../utils/logger.js";
import {
  EventUserSchema,
  BulkAddEventUsersSchema,
} from "../types/event-user.types.js";

export class EventUserController {
  private eventUserService: EventUserService;

  constructor() {
    this.eventUserService = new EventUserService();
  }

  async getUser(req: Request, res: Response): Promise<void> {
    try {
      const otpParam = req.params["otp"];
      const otp = Array.isArray(otpParam) ? otpParam[0] : otpParam;

      if (
        otp === undefined ||
        otp === null ||
        otp === "" ||
        !/^\d{6}$/.test(otp)
      ) {
        res.status(400).json({ error: "Valid 6-digit OTP is required" });
        return;
      }

      const user = await this.eventUserService.getUser(otp);

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({ data: user });
    } catch (error) {
      logger.error("Error getting event user:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  }

  async addUser(req: Request, res: Response): Promise<void> {
    try {
      const otpParam = req.params["otp"];
      const otp = Array.isArray(otpParam) ? otpParam[0] : otpParam;

      if (
        otp === undefined ||
        otp === null ||
        otp === "" ||
        !/^\d{6}$/.test(otp)
      ) {
        res.status(400).json({ error: "Valid 6-digit OTP is required" });
        return;
      }

      const parseResult = EventUserSchema.safeParse(req.body);

      if (!parseResult.success) {
        res
          .status(400)
          .json({ error: "Invalid user data", details: parseResult.error });
        return;
      }

      const user = await this.eventUserService.addUser(otp, parseResult.data);

      res.status(201).json({ data: user });
    } catch (error) {
      logger.error("Error adding event user:", error);
      res.status(500).json({ error: "Failed to add user" });
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const otpParam = req.params["otp"];
      const otp = Array.isArray(otpParam) ? otpParam[0] : otpParam;

      if (
        otp === undefined ||
        otp === null ||
        otp === "" ||
        !/^\d{6}$/.test(otp)
      ) {
        res.status(400).json({ error: "Valid 6-digit OTP is required" });
        return;
      }

      const deleted = await this.eventUserService.deleteUser(otp);

      if (!deleted) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting event user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }

  async bulkAddUsers(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = BulkAddEventUsersSchema.safeParse(req.body);

      if (!parseResult.success) {
        res
          .status(400)
          .json({ error: "Invalid bulk data", details: parseResult.error });
        return;
      }

      const count = await this.eventUserService.bulkAddUsers(parseResult.data);

      res.status(201).json({ message: `Added ${count} users` });
    } catch (error) {
      logger.error("Error bulk adding event users:", error);
      res.status(500).json({ error: "Failed to bulk add users" });
    }
  }

  async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await this.eventUserService.getAllUsers();

      res.status(200).json({ data: users });
    } catch (error) {
      logger.error("Error getting all event users:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  }
}
