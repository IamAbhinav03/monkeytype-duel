import { z } from "zod";

export type User = {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

export const CreateUserDtoSchema = z.object({
  username: z.string(),
  email: z.string().email(),
});

export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

export const UpdateUserDtoSchema = z.object({
  username: z.string().optional(),
  email: z.string().email().optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;
