import { v4 as uuidv4 } from "uuid";
import { User, CreateUserDto, UpdateUserDto } from "../types/user.types.js";
import logger from "../utils/logger.js";

export class UserService {
  // In-memory storage for demonstration purposes
  // In production, this would connect to a database
  private users: Map<string, User> = new Map();

  async getUserById(userId: string): Promise<User | null> {
    logger.info(`Getting user by ID: ${userId}`);
    return this.users.get(userId) ?? null;
  }

  async createUser(userData: CreateUserDto): Promise<User> {
    logger.info(`Creating user: ${userData.username}`);

    const user: User = {
      id: uuidv4(),
      username: userData.username,
      email: userData.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.set(user.id, user);

    return user;
  }

  async updateUser(
    userId: string,
    userData: UpdateUserDto,
  ): Promise<User | null> {
    logger.info(`Updating user: ${userId}`);

    const user = this.users.get(userId);

    if (!user) {
      return null;
    }

    const updatedUser: User = {
      ...user,
      username: userData.username ?? user.username,
      email: userData.email ?? user.email,
      updatedAt: new Date(),
    };

    this.users.set(userId, updatedUser);

    return updatedUser;
  }

  async deleteUser(userId: string): Promise<boolean> {
    logger.info(`Deleting user: ${userId}`);
    return this.users.delete(userId);
  }

  async getAllUsers(): Promise<User[]> {
    logger.info("Getting all users");
    return Array.from(this.users.values());
  }
}
