import { z } from "zod";

export const EventUserSchema = z.object({
  "user-full-name": z.string(),
  "user-uuid": z.string(),
  "preferred-theme": z.string(),
  wpm: z.number(),
  accuracy: z.number(),
  raw: z.number(),
  "user-email": z.string().email(),
});

export type EventUser = z.infer<typeof EventUserSchema>;

export const BulkAddEventUsersSchema = z.record(
  z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
  EventUserSchema,
);

export const EventUserDatabaseSchema = z.record(z.string(), EventUserSchema);

export type EventUserDatabase = Record<string, EventUser>;
