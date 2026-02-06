import { Request, Response } from "express";
import logger from "../utils/logger.js";

export async function getHealth(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json({
      status: "healthy",
      service: "user-handler",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      service: "user-handler",
    });
  }
}
