import fs from "fs/promises";
import path from "path";
import {
  EventUser,
  EventUserDatabase,
  EventUserDatabaseSchema,
} from "../types/event-user.types.js";
import logger from "../utils/logger.js";

const DB_PATH = path.join(process.cwd(), "data", "event-users.json");

export class EventUserService {
  private async ensureDbFile(): Promise<void> {
    try {
      await fs.access(DB_PATH);
    } catch {
      await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
      await fs.writeFile(DB_PATH, JSON.stringify({}, null, 2));
    }
  }

  private async readDb(): Promise<EventUserDatabase> {
    await this.ensureDbFile();
    const data = await fs.readFile(DB_PATH, "utf-8");
    const parsed: unknown = JSON.parse(data);
    return EventUserDatabaseSchema.parse(parsed);
  }

  private async writeDb(data: EventUserDatabase): Promise<void> {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
  }

  async getUser(otp: string): Promise<EventUser | null> {
    const db = await this.readDb();
    return db[otp] ?? null;
  }

  async addUser(otp: string, user: EventUser): Promise<EventUser> {
    const db = await this.readDb();
    db[otp] = user;
    await this.writeDb(db);
    logger.info(`Added user with OTP: ${otp}`);
    return user;
  }

  async deleteUser(otp: string): Promise<boolean> {
    const db = await this.readDb();
    if (!(otp in db)) {
      return false;
    }
    delete db[otp];
    await this.writeDb(db);
    logger.info(`Deleted user with OTP: ${otp}`);
    return true;
  }

  async bulkAddUsers(users: EventUserDatabase): Promise<number> {
    const db = await this.readDb();
    let count = 0;
    for (const [otp, user] of Object.entries(users)) {
      db[otp] = user;
      count++;
    }
    await this.writeDb(db);
    logger.info(`Bulk added ${count} users`);
    return count;
  }

  async getAllUsers(): Promise<EventUserDatabase> {
    return await this.readDb();
  }
}
