import { z } from "zod";
import {
  TRIBES_PROTOCOL_VERSION,
  RoomSchema,
  RoomConfigSchema,
  RoomStateSchema,
  TribeUserSchema,
  UserProgressSchema,
  UserProgressOutSchema,
  TribeResultSchema,
  MiniCrownsSchema,
  FinalPositionsSchema,
  SystemStatsSchema,
  TribeUserNameSchema,
  ChatMessageSchema,
  RoomNameSchema,
  PublicRoomDataSchema,
} from "@monkeytype/schemas/tribes";

// ============================================================================
// Re-export protocol version
// ============================================================================

export { TRIBES_PROTOCOL_VERSION };

// ============================================================================
// Event Metadata
// ============================================================================

export type SocketEventMetadata = {
  /** If true, this event does not require authentication */
  isPublic?: boolean;
  /** Rate limit key from tribes rate limits */
  rateLimit?: string;
  /** Description of the event */
  description?: string;
};

// ============================================================================
// Client -> Server Event Payloads
// ============================================================================

// System events
export const SystemVersionCheckPayloadSchema = z
  .object({
    version: z.string(),
  })
  .strict();
export type SystemVersionCheckPayload = z.infer<
  typeof SystemVersionCheckPayloadSchema
>;

export const SystemVersionCheckAckSchema = z
  .object({
    status: z.string(),
    version: z.string(),
  })
  .strict();
export type SystemVersionCheckAck = z.infer<typeof SystemVersionCheckAckSchema>;

// Room management
export const RoomCreatePayloadSchema = z
  .object({
    config: RoomConfigSchema,
    type: z.string().optional(),
  })
  .strict();
export type RoomCreatePayload = z.infer<typeof RoomCreatePayloadSchema>;

export const RoomJoinPayloadSchema = z
  .object({
    roomId: z.string(),
    fromBrowser: z.boolean(),
  })
  .strict();
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>;

export const RoomJoinAckSchema = z
  .object({
    status: z.string().optional(),
    room: RoomSchema.optional(),
  })
  .strict();
export type RoomJoinAck = z.infer<typeof RoomJoinAckSchema>;

export const RoomGetPublicRoomsPayloadSchema = z
  .object({
    page: z.number().int().nonnegative(),
    search: z.string().max(100),
  })
  .strict();
export type RoomGetPublicRoomsPayload = z.infer<
  typeof RoomGetPublicRoomsPayloadSchema
>;

export const RoomGetPublicRoomsAckSchema = z
  .object({
    rooms: z.array(PublicRoomDataSchema),
  })
  .strict();
export type RoomGetPublicRoomsAck = z.infer<typeof RoomGetPublicRoomsAckSchema>;

// Race events
export const RoomResultPayloadSchema = z
  .object({
    result: TribeResultSchema,
  })
  .strict();
export type RoomResultPayload = z.infer<typeof RoomResultPayloadSchema>;

// Chat events
export const RoomChatMessagePayloadSchema = z
  .object({
    message: ChatMessageSchema,
  })
  .strict();
export type RoomChatMessagePayload = z.infer<
  typeof RoomChatMessagePayloadSchema
>;

export const RoomChattingUpdatePayloadSchema = z
  .object({
    isChatting: z.boolean(),
  })
  .strict();
export type RoomChattingUpdatePayload = z.infer<
  typeof RoomChattingUpdatePayloadSchema
>;

// Room config events
export const RoomUpdateConfigPayloadSchema = z
  .object({
    config: RoomConfigSchema,
  })
  .strict();
export type RoomUpdateConfigPayload = z.infer<
  typeof RoomUpdateConfigPayloadSchema
>;

export const RoomUpdateNamePayloadSchema = z
  .object({
    name: RoomNameSchema,
  })
  .strict();
export type RoomUpdateNamePayload = z.infer<typeof RoomUpdateNamePayloadSchema>;

// User management events
export const RoomBanUserPayloadSchema = z
  .object({
    userId: z.string(),
  })
  .strict();
export type RoomBanUserPayload = z.infer<typeof RoomBanUserPayloadSchema>;

export const RoomGiveLeaderPayloadSchema = z
  .object({
    userId: z.string(),
  })
  .strict();
export type RoomGiveLeaderPayload = z.infer<typeof RoomGiveLeaderPayloadSchema>;

// User status events
export const RoomAfkUpdatePayloadSchema = z
  .object({
    isAfk: z.boolean(),
  })
  .strict();
export type RoomAfkUpdatePayload = z.infer<typeof RoomAfkUpdatePayloadSchema>;

// User events
export const UserSetNamePayloadSchema = z
  .object({
    name: TribeUserNameSchema,
    confirm: z.boolean(),
  })
  .strict();
export type UserSetNamePayload = z.infer<typeof UserSetNamePayloadSchema>;

// ============================================================================
// Server -> Client Event Payloads
// ============================================================================

// System events
export const SystemNotificationPayloadSchema = z
  .object({
    message: z.string(),
    level: z.number().int().optional(),
    playMentionSound: z.boolean().optional(),
  })
  .strict();
export type SystemNotificationPayload = z.infer<
  typeof SystemNotificationPayloadSchema
>;

// Room management events
export const RoomJoinedPayloadSchema = z
  .object({
    room: RoomSchema,
  })
  .strict();
export type RoomJoinedPayload = z.infer<typeof RoomJoinedPayloadSchema>;

export const RoomPlayerJoinedPayloadSchema = z
  .object({
    user: TribeUserSchema,
  })
  .strict();
export type RoomPlayerJoinedPayload = z.infer<
  typeof RoomPlayerJoinedPayloadSchema
>;

export const RoomPlayerLeftPayloadSchema = z
  .object({
    userId: z.string(),
  })
  .strict();
export type RoomPlayerLeftPayload = z.infer<typeof RoomPlayerLeftPayloadSchema>;

// Room state events
export const RoomStateChangedPayloadSchema = z
  .object({
    state: RoomStateSchema,
  })
  .strict();
export type RoomStateChangedPayload = z.infer<
  typeof RoomStateChangedPayloadSchema
>;

export const RoomVisibilityChangedPayloadSchema = z
  .object({
    isPrivate: z.boolean(),
  })
  .strict();
export type RoomVisibilityChangedPayload = z.infer<
  typeof RoomVisibilityChangedPayloadSchema
>;

export const RoomNameChangedPayloadSchema = z
  .object({
    name: z.string(),
  })
  .strict();
export type RoomNameChangedPayload = z.infer<
  typeof RoomNameChangedPayloadSchema
>;

export const RoomConfigChangedPayloadSchema = z
  .object({
    config: RoomConfigSchema,
  })
  .strict();
export type RoomConfigChangedPayload = z.infer<
  typeof RoomConfigChangedPayloadSchema
>;

// User status events
export const RoomUserIsReadyPayloadSchema = z
  .object({
    userId: z.string(),
    isReady: z.boolean(),
  })
  .strict();
export type RoomUserIsReadyPayload = z.infer<
  typeof RoomUserIsReadyPayloadSchema
>;

export const RoomUserAfkUpdatePayloadSchema = z
  .object({
    userId: z.string(),
    isAfk: z.boolean(),
  })
  .strict();
export type RoomUserAfkUpdatePayload = z.infer<
  typeof RoomUserAfkUpdatePayloadSchema
>;

export const RoomLeaderChangedPayloadSchema = z
  .object({
    userId: z.string(),
  })
  .strict();
export type RoomLeaderChangedPayload = z.infer<
  typeof RoomLeaderChangedPayloadSchema
>;

export const RoomChattingChangedPayloadSchema = z
  .object({
    userId: z.string(),
    isChatting: z.boolean(),
  })
  .strict();
export type RoomChattingChangedPayload = z.infer<
  typeof RoomChattingChangedPayloadSchema
>;

// Chat events
export const RoomChatMessageOutPayloadSchema = z
  .object({
    message: z.string(),
    from: TribeUserSchema.optional(),
    isSystem: z.boolean(),
  })
  .strict();
export type RoomChatMessageOutPayload = z.infer<
  typeof RoomChatMessageOutPayloadSchema
>;

// Race events
export const RoomInitRacePayloadSchema = z
  .object({
    seed: z.number().int(),
  })
  .strict();
export type RoomInitRacePayload = z.infer<typeof RoomInitRacePayloadSchema>;

export const RoomCountdownPayloadSchema = z
  .object({
    time: z.number().int().nonnegative(),
  })
  .strict();
export type RoomCountdownPayload = z.infer<typeof RoomCountdownPayloadSchema>;

export const RoomProgressUpdatePayloadSchema = z
  .object({
    users: z.record(z.string(), UserProgressSchema),
    roomMaxRaw: z.number().nonnegative(),
    roomMaxWpm: z.number().nonnegative(),
    roomMinRaw: z.number().nonnegative(),
    roomMinWpm: z.number().nonnegative(),
  })
  .strict();
export type RoomProgressUpdatePayload = z.infer<
  typeof RoomProgressUpdatePayloadSchema
>;

export const RoomUsersUpdatePayloadSchema = z.record(
  z.string(),
  TribeUserSchema,
);
export type RoomUsersUpdatePayload = z.infer<
  typeof RoomUsersUpdatePayloadSchema
>;

export const RoomUserResultPayloadSchema = z
  .object({
    userId: z.string(),
    result: TribeResultSchema.optional(),
  })
  .strict();
export type RoomUserResultPayload = z.infer<typeof RoomUserResultPayloadSchema>;

export const RoomTimerCountdownPayloadSchema = z
  .object({
    time: z.number().int().nonnegative(),
  })
  .strict();
export type RoomTimerCountdownPayload = z.infer<
  typeof RoomTimerCountdownPayloadSchema
>;

export const RoomFinalPositionsPayloadSchema = z
  .object({
    positions: FinalPositionsSchema,
    miniCrowns: MiniCrownsSchema,
  })
  .strict();
export type RoomFinalPositionsPayload = z.infer<
  typeof RoomFinalPositionsPayloadSchema
>;

export const RoomRaceForceFinishPayloadSchema = z
  .object({
    reason: z.string(),
  })
  .strict();
export type RoomRaceForceFinishPayload = z.infer<
  typeof RoomRaceForceFinishPayloadSchema
>;

// User events
export const UserUpdateNamePayloadSchema = z
  .object({
    name: z.string(),
  })
  .strict();
export type UserUpdateNamePayload = z.infer<typeof UserUpdateNamePayloadSchema>;

// ============================================================================
// Client -> Server Events Contract
// ============================================================================

export const clientToServerEvents = {
  // System events
  system_version_check: {
    payload: SystemVersionCheckPayloadSchema,
    ack: SystemVersionCheckAckSchema,
    metadata: {
      isPublic: true,
      rateLimit: "tribeSystemCheck",
      description: "Check if client version matches server version",
    },
  },
  system_stats: {
    payload: z.undefined(),
    ack: SystemStatsSchema,
    metadata: {
      isPublic: true,
      rateLimit: "tribeStats",
      description: "Get current system statistics",
    },
  },

  // Room management
  room_create: {
    payload: RoomCreatePayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeRoomCreate",
      description: "Create a new room",
    },
  },
  room_join: {
    payload: RoomJoinPayloadSchema,
    ack: RoomJoinAckSchema,
    metadata: {
      rateLimit: "tribeRoomJoin",
      description: "Join an existing room",
    },
  },
  room_leave: {
    payload: z.undefined(),
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeRoomLeave",
      description: "Leave the current room",
    },
  },
  room_get_public_rooms: {
    payload: RoomGetPublicRoomsPayloadSchema,
    ack: RoomGetPublicRoomsAckSchema,
    metadata: {
      isPublic: true,
      rateLimit: "tribeRoomList",
      description: "Get list of public rooms",
    },
  },

  // Race events
  room_init_race: {
    payload: z.undefined(),
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeRaceInit",
      description: "Initialize a new race (leader only)",
    },
  },
  room_ready_update: {
    payload: z.undefined(),
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeReadyUpdate",
      description: "Toggle ready status",
    },
  },
  room_progress_update: {
    payload: UserProgressOutSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeProgressUpdate",
      description: "Send typing progress during race",
    },
  },
  room_result: {
    payload: RoomResultPayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeResult",
      description: "Submit race result",
    },
  },
  room_back_to_lobby: {
    payload: z.undefined(),
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeBackToLobby",
      description: "Return to lobby after race",
    },
  },

  // Chat events
  room_chat_message: {
    payload: RoomChatMessagePayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeChatMessage",
      description: "Send a chat message",
    },
  },
  room_chatting_update: {
    payload: RoomChattingUpdatePayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeChattingUpdate",
      description: "Update chatting status",
    },
  },

  // Room config events (leader only)
  room_update_config: {
    payload: RoomUpdateConfigPayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeRoomConfig",
      description: "Update room configuration (leader only)",
    },
  },
  room_toggle_visibility: {
    payload: z.undefined(),
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeRoomVisibility",
      description: "Toggle room visibility (leader only)",
    },
  },
  room_update_name: {
    payload: RoomUpdateNamePayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeRoomName",
      description: "Update room name (leader only)",
    },
  },

  // User management events (leader only)
  room_ban_user: {
    payload: RoomBanUserPayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeBanUser",
      description: "Remove a user from room (leader only)",
    },
  },
  room_give_leader: {
    payload: RoomGiveLeaderPayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeGiveLeader",
      description: "Transfer leadership (leader only)",
    },
  },

  // User status events
  room_afk_update: {
    payload: RoomAfkUpdatePayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeAfkUpdate",
      description: "Update AFK status",
    },
  },

  // User events
  user_set_name: {
    payload: UserSetNamePayloadSchema,
    ack: z.undefined(),
    metadata: {
      rateLimit: "tribeSetName",
      description: "Set or update display name",
    },
  },

  // Dev events
  dev_room: {
    payload: z.undefined(),
    ack: z.undefined(),
    metadata: {
      isPublic: true,
      rateLimit: "tribeDevRoom",
      description: "Create/join dev room (dev mode only)",
    },
  },
} as const;

export type ClientToServerEventName = keyof typeof clientToServerEvents;

// ============================================================================
// Server -> Client Events Contract
// ============================================================================

export const serverToClientEvents = {
  // System events
  system_notification: {
    payload: SystemNotificationPayloadSchema,
    description: "System notification to client",
  },

  // Room management events
  room_joined: {
    payload: RoomJoinedPayloadSchema,
    description: "Successfully joined a room",
  },
  room_player_joined: {
    payload: RoomPlayerJoinedPayloadSchema,
    description: "A player joined the room",
  },
  room_player_left: {
    payload: RoomPlayerLeftPayloadSchema,
    description: "A player left the room",
  },
  room_left: {
    payload: z.undefined(),
    description: "Successfully left the room",
  },

  // Room state events
  room_state_changed: {
    payload: RoomStateChangedPayloadSchema,
    description: "Room state changed",
  },
  room_visibility_changed: {
    payload: RoomVisibilityChangedPayloadSchema,
    description: "Room visibility changed",
  },
  room_name_changed: {
    payload: RoomNameChangedPayloadSchema,
    description: "Room name changed",
  },
  room_config_changed: {
    payload: RoomConfigChangedPayloadSchema,
    description: "Room configuration changed",
  },

  // User status events
  room_user_is_ready: {
    payload: RoomUserIsReadyPayloadSchema,
    description: "User ready status changed",
  },
  room_user_afk_update: {
    payload: RoomUserAfkUpdatePayloadSchema,
    description: "User AFK status changed",
  },
  room_leader_changed: {
    payload: RoomLeaderChangedPayloadSchema,
    description: "Room leader changed",
  },
  room_chatting_changed: {
    payload: RoomChattingChangedPayloadSchema,
    description: "User chatting status changed",
  },

  // Chat events
  room_chat_message: {
    payload: RoomChatMessageOutPayloadSchema,
    description: "Chat message received",
  },

  // Race events
  room_init_race: {
    payload: RoomInitRacePayloadSchema,
    description: "Race initialized with seed",
  },
  room_countdown: {
    payload: RoomCountdownPayloadSchema,
    description: "Race countdown tick",
  },
  room_race_started: {
    payload: z.undefined(),
    description: "Race has started",
  },
  room_progress_update: {
    payload: RoomProgressUpdatePayloadSchema,
    description: "Progress update for all users",
  },
  room_users_update: {
    payload: RoomUsersUpdatePayloadSchema,
    description: "Full users update",
  },
  room_user_result: {
    payload: RoomUserResultPayloadSchema,
    description: "User submitted result",
  },
  room_finishTimer_countdown: {
    payload: RoomTimerCountdownPayloadSchema,
    description: "Finish timer countdown",
  },
  room_readyTimer_countdown: {
    payload: RoomTimerCountdownPayloadSchema,
    description: "Ready timer countdown",
  },
  room_readyTimer_over: {
    payload: z.undefined(),
    description: "Ready timer expired",
  },
  room_back_to_lobby: {
    payload: z.undefined(),
    description: "Returning to lobby",
  },
  room_final_positions: {
    payload: RoomFinalPositionsPayloadSchema,
    description: "Final race positions and crowns",
  },
  room_race_force_finish: {
    payload: RoomRaceForceFinishPayloadSchema,
    description: "Race forcefully finished",
  },

  // User events
  user_update_name: {
    payload: UserUpdateNamePayloadSchema,
    description: "Name update confirmed",
  },
} as const;

export type ServerToClientEventName = keyof typeof serverToClientEvents;

// ============================================================================
// Type Helpers for Socket.IO
// ============================================================================

type ClientEventHandler<TPayload, TAck> = TAck extends undefined
  ? TPayload extends undefined
    ? () => void
    : (data: TPayload) => void
  : TPayload extends undefined
    ? (callback: (response: TAck) => void) => void
    : (data: TPayload, callback: (response: TAck) => void) => void;

export type ClientToServerEvents = {
  [K in ClientToServerEventName]: ClientEventHandler<
    z.infer<(typeof clientToServerEvents)[K]["payload"]>,
    z.infer<(typeof clientToServerEvents)[K]["ack"]>
  >;
};

type ServerEventHandler<TPayload> = TPayload extends undefined
  ? () => void
  : (data: TPayload) => void;

export type ServerToClientEvents = {
  [K in ServerToClientEventName]: ServerEventHandler<
    z.infer<(typeof serverToClientEvents)[K]["payload"]>
  >;
};

export type InterServerEvents = Record<string, never>;

export type { SocketData } from "@monkeytype/schemas/tribes";
