import type {
  Room,
  User,
  UserProgress,
  UserProgressOut,
  Result,
  RoomState,
  MiniCrowns,
  FinalPositions,
  SystemStats,
} from "./room.js";
import type { RoomConfig } from "./config.js";

// Client -> Server Events
/**
 * Represents all events that can be emitted from the client to the server.
 *
 * @system_version_check - Checks if the client version matches the server version
 * @system_stats - Retrieves current system statistics from the server
 *
 * @room_create - Creates a new room with the specified configuration
 * @room_join - Joins an existing room by ID
 * @room_leave - Leaves the current room
 * @room_get_public_rooms - Fetches paginated list of public rooms with optional search filter
 *
 * @room_init_race - Initializes a new race in the current room
 * @room_ready_update - Notifies the server that the user is ready to start the race. The server will update the user's ready status and may trigger race start when all users are ready.
 * @room_progress_update - Sends the user's real-time progress during an active race (WPM, accuracy, etc.)
 * @room_result - Submits the user's final race result after completion
 * @room_back_to_lobby - Signals the user's intent to return to the lobby after a race
 *
 * @room_chat_message - Sends a chat message to all users in the room
 * @room_chatting_update - Updates the server on whether the user is currently typing a message
 *
 * @room_update_config - Updates room configuration (leader only)
 * @room_toggle_visibility - Toggles room visibility between public and private (leader only)
 * @room_update_name - Updates the room's display name (leader only)
 *
 * @room_ban_user - Removes a user from the room (leader only)
 * @room_give_leader - Transfers leadership to another user (leader only)
 *
 * @room_afk_update - Updates the server on the user's AFK (away from keyboard) status
 * @user_set_name - Sets or updates the user's display name
 *
 * @dev_room - Developer utility for creating a test room
 */
export type ClientToServerEvents = {
  // System events
  system_version_check: (
    data: { version: string },
    callback: (response: { status: string; version: string }) => void,
  ) => void;
  system_stats: (callback: (response: SystemStats) => void) => void;

  // Room management events
  room_create: (data: { config: RoomConfig; type?: string }) => void;
  room_join: (
    data: { roomId: string; fromBrowser: boolean },
    callback: (response: { status?: string; room?: Room }) => void,
  ) => void;
  room_leave: () => void;
  room_get_public_rooms: (
    data: { page: number; search: string },
    callback: (response: { rooms: Room[] }) => void,
  ) => void;

  // Race events
  room_init_race: () => void;
  room_ready_update: () => void;
  room_progress_update: (data: UserProgressOut) => void;
  room_result: (data: { result: Result }) => void;
  room_back_to_lobby: () => void;

  // Chat events
  room_chat_message: (data: { message: string }) => void;
  room_chatting_update: (data: { isChatting: boolean }) => void;

  // Room config events (leader only)
  room_update_config: (data: { config: RoomConfig }) => void;
  room_toggle_visibility: () => void;
  room_update_name: (data: { name: string }) => void;

  // User management events (leader only)
  room_ban_user: (data: { userId: string }) => void;
  room_give_leader: (data: { userId: string }) => void;

  // User status events
  room_afk_update: (data: { isAfk: boolean }) => void;

  // User events
  user_set_name: (data: { name: string; confirm: boolean }) => void;

  // Dev events
  dev_room: () => void;
};

// Server -> Client Events
export type ServerToClientEvents = {
  // System events
  system_notification: (data: {
    message: string;
    level?: number;
    playMentionSound?: boolean;
  }) => void;

  // Room management events
  room_joined: (data: { room: Room }) => void;
  room_player_joined: (data: { user: User }) => void;
  room_player_left: (data: { userId: string }) => void;
  room_left: () => void;

  // Room state events
  room_state_changed: (data: { state: RoomState }) => void;
  room_visibility_changed: (data: { isPrivate: boolean }) => void;
  room_name_changed: (data: { name: string }) => void;
  room_config_changed: (data: { config: RoomConfig }) => void;

  // User status events
  room_user_is_ready: (data: { userId: string; isReady: boolean }) => void;
  room_user_afk_update: (data: { userId: string; isAfk: boolean }) => void;
  room_leader_changed: (data: { userId: string }) => void;
  room_chatting_changed: (data: {
    userId: string;
    isChatting: boolean;
  }) => void;

  // Chat events
  room_chat_message: (data: {
    message: string;
    from?: User;
    isSystem: boolean;
  }) => void;

  // Race events
  room_init_race: (data: { seed: number; practiceRound?: number }) => void;
  room_countdown: (data: { time: string }) => void;
  room_race_started: () => void;
  room_progress_update: (data: {
    users: Record<string, UserProgress>;
    roomMaxRaw: number;
    roomMaxWpm: number;
    roomMinRaw: number;
    roomMinWpm: number;
  }) => void;
  room_users_update: (data: Record<string, User>) => void;
  room_user_result: (data: { userId: string; result?: Result }) => void;
  room_finishTimer_countdown: (data: { time: number }) => void;
  room_readyTimer_countdown: (data: { time: number }) => void;
  room_readyTimer_over: () => void;
  room_back_to_lobby: (data: {
    practiceRound?: number;
    briefDisplay: boolean;
  }) => void;
  room_final_positions: (data: {
    positions: FinalPositions;
    miniCrowns: MiniCrowns;
  }) => void;
  room_race_force_finish: (data: { reason: string }) => void;
  room_lobby_autostart_countdown: (data: { time: number }) => void;

  // User events
  user_update_name: (data: { name: string }) => void;
};

// Inter-server events (none for now)
export type InterServerEvents = Record<string, never>;

// Socket data
export type SocketData = {
  name: string;
  roomId?: string;
};
