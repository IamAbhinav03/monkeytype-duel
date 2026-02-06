import dotenv from "dotenv";

dotenv.config();

type Config = {
  port: number;
  mode: "dev" | "prod";
  version: string;
  corsOrigin: string;
  logLevel: string;
};

const config: Config = {
  port: parseInt(process.env["PORT"] ?? "3006", 10),
  mode: (process.env["MODE"] as "dev" | "prod") ?? "dev",
  version: process.env["USER_HANDLER_VERSION"] ?? "1.0.0",
  corsOrigin: process.env["CORS_ORIGIN"] ?? "*",
  logLevel: process.env["LOG_LEVEL"] ?? "info",
};

export default config;
