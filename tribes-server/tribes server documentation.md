# Tribes Server Documentation

## Overview
The Tribes Server is a real-time multiplayer typing race server built with Node.js, Express, and Socket.IO. It facilitates competitive typing races in rooms, supports matchmaking, and handles user interactions via WebSocket events. The server is part of the MonkeyType project, enabling users to compete in typing challenges.

## Architecture
- **Framework**: Node.js with Express for HTTP server and Socket.IO for real-time communication.
- **Language**: TypeScript.
- **Key Components**:
  - Controllers: Handle Socket.IO event listeners.
  - Services: Business logic for rooms, races, matchmaking, etc.
  - Stores: In-memory data storage for rooms and matchmaking queues.
  - Types: TypeScript definitions for data structures and events.
  - Utils: Helper functions like ID generation and logging.

## Data Schema

### Room
A room represents a game session where users compete in typing races.

```typescript
type Room = {
  id: string;
  state: RoomState; // e.g., LOBBY, RACE_ONGOING
  users: Record<string, User>;
  size: number;
  updateRate: number; // Progress update interval in ms
  isPrivate: boolean;
  name: string;
  config: RoomConfig;
  maxRaw: number;
  maxWpm: number;
  minRaw: number;
  minWpm: number;
  seed: number; // For randomizing text
};
```

### User
Represents a participant in a room.

```typescript
type User = {
  id: string;
  isLeader?: boolean;
  name: string;
  isReady?: boolean;
  result?: Result;
  progress?: UserProgress;
  isFinished?: boolean;
  isTyping?: boolean;
  isAfk?: boolean;
  isChatting?: boolean;
  points?: number;
};
```

### RoomConfig
Configuration for a room's typing test settings.

```typescript
type RoomConfig = {
  mode: "time" | "words" | "custom" | "quote" | "zen";
  time: number;
  words: number;
  language: string;
  difficulty: "normal" | "expert" | "master";
  punctuation: boolean;
  numbers: boolean;
  funbox: string;
  lazyMode: boolean;
  stopOnError: "off" | "word" | "letter";
  minWpm: "off" | "custom";
  minWpmCustomSpeed: number;
  minAcc: "off" | "custom";
  minAccCustom: number;
  minBurst: "off" | "fixed" | "flex";
  minBurstCustomSpeed: number;
  quoteLength: number[];
  customText: CustomTextSettings;
};
```

### Result
Typing test result data.

```typescript
type Result = {
  wpm: number;
  raw: number;
  acc: number;
  consistency: number;
  testDuration: number;
  charStats: number[];
  chartData: ChartData;
  resolve: ResultResolve;
};
```

### UserProgress
Real-time progress during a race.

```typescript
type UserProgress = {
  wpm: number;
  raw: number;
  acc: number;
  progress: number; // Percentage complete
  wpmProgress: number;
  wordIndex: number;
  letterIndex: number;
  afk: boolean;
};
```

## Socket.IO Events

### Client to Server Events
- `system_version_check`: Check server version.
- `system_stats`: Request system statistics.
- `room_create`: Create a new room.
- `room_join`: Join an existing room.
- `room_leave`: Leave the current room.
- `room_get_public_rooms`: Get list of public rooms.
- `room_init_race`: Start a race in the room.
- `room_ready_update`: Toggle ready status.
- `room_progress_update`: Send typing progress.
- `room_result`: Submit race result.
- `room_back_to_lobby`: Return to lobby after race.
- `room_chat_message`: Send chat message.
- `room_chatting_update`: Update chatting status.
- `room_update_config`: Update room config (leader only).
- `room_toggle_visibility`: Toggle room privacy.
- `room_update_name`: Change room name (leader only).
- `room_ban_user`: Ban a user (leader only).
- `room_give_leader`: Transfer leadership (leader only).
- `room_afk_update`: Update AFK status.
- `user_set_name`: Set user name.
- `dev_room`: Dev-only room creation.

### Server to Client Events
- `system_notification`: Send system notifications.
- `room_joined`: Confirm room join.
- `room_player_joined`: Notify of new player.
- `room_player_left`: Notify of player leaving.
- `room_left`: Confirm room leave.
- `room_state_changed`: Room state update.
- `room_visibility_changed`: Privacy change.
- `room_name_changed`: Name change.
- `room_config_changed`: Config update.
- `room_user_is_ready`: User ready status.
- `room_user_afk_update`: AFK status update.
- `room_leader_changed`: Leadership change.
- `room_chatting_changed`: Chatting status.
- `room_chat_message`: Chat message.
- `room_init_race`: Race initialization.
- `room_countdown`: Countdown before race.
- `room_race_started`: Race start.
- `room_progress_update`: Progress updates.
- `room_users_update`: User list update.
- `room_user_result`: Individual result.
- `room_finishTimer_countdown`: Finish timer.
- `room_readyTimer_countdown`: Ready timer.
- `room_readyTimer_over`: Ready timer expired.
- `room_back_to_lobby`: Back to lobby.
- `room_final_positions`: Final rankings.
- `room_race_force_finish`: Force finish race.
- `user_update_name`: Name update.

## How Sockets Work
- **Connection**: Clients connect via Socket.IO, providing a name in the handshake query.
- **Rooms**: Socket.IO rooms are used to group users in the same game room.
- **Event Handling**: Controllers register event listeners on socket connections.
- **Data Storage**: Socket data includes user name and room ID.
- **Real-time Updates**: Progress and state changes are broadcasted to room members.
- **Disconnection**: Handled to clean up user from rooms.

## Key Functions and Services

### Room Service
- `createRoom`: Creates a new room and assigns leader.
- `joinRoom`: Adds user to room if conditions met.
- `leaveRoom`: Removes user and handles leadership transfer.
- `initRace`: Starts race countdown and setup.
- `toggleReady`: Toggles user ready status.
- `updateProgress`: Broadcasts typing progress.
- `submitResult`: Processes and stores race results.
- `backToLobby`: Resets room to lobby state.
- `sendChatMessage`: Broadcasts chat messages.
- `updateConfig`: Updates room settings (leader only).
- `banUser`: Removes and bans user (leader only).

### Race Service
Handles race logic, including starting races, managing timers, calculating results, and awarding points.

### Matchmaking Service
- Runs periodic checks for queued players.
- Matches players into rooms based on queue preferences.
- Supports multiple queue types (e.g., 15s time, 60s time, quotes).

### Timer Service
Manages various timers (countdown, finish, ready) using Node.js timeouts and intervals.

### Points Service
Calculates and awards points based on race performance and final positions.

### Stores
- **Room Store**: Manages room data, user additions/removals, state changes.
- **Matchmaking Store**: Handles player queues for matchmaking.

## Routes (HTTP)
- `GET /health`: Health check endpoint returning `{ status: "ok" }`.

## Configuration
- **Port**: 3005 (default).
- **Mode**: "dev" or "production" for CORS settings.
- **CORS**: Allows all origins in dev, specific domains in production.

## Development
- Uses TypeScript for type safety.
- Logging via custom Logger utility.
- ID generation for rooms and seeds.
- In-memory storage (no persistence).

## Frontend Interaction

The frontend, built with JavaScript/TypeScript and likely using a framework like Vue or plain DOM manipulation, interacts with the Tribes Server via Socket.IO. The main entry point is the `tribe` module in `frontend/src/ts/tribe/tribe.ts`, which orchestrates the multiplayer experience.

### Key Frontend Components
- **TribeSocket**: Handles Socket.IO connection to the server (connects to `tribe.monkeytype.com` in production or `localhost:3005` in dev). Manages incoming and outgoing events via routes (room, system, user, dev).
- **TribeState**: Manages client-side state, including current room, user data, and connection status.
- **TribePages**: Manages UI pages for different states (menu, lobby, race, results). Includes:
  - `TribePageMenu`: Room creation and joining interface.
  - `TribePageLobby`: Waiting area with user list, chat, and settings.
  - `TribePagePreloader`: Loading screen.
- **TribeChat**: Handles chat messages and UI.
- **TribeCountdown**: Manages race countdown timer.
- **TribeBars**: Displays progress bars for users.
- **TribeResults**: Shows race results and final positions.
- **TribeUserList**: Displays list of users in the room.
- **TribeButtons**: UI buttons for actions like ready, leave.
- **TribeChartController**: Manages live charts during races.
- **TribeDelta**: Calculates and displays WPM deltas.
- **TribeCarets**: Renders carets for other users' positions.
- **TribeSound**: Plays sound effects for events.
- **TribeConfig**: Manages room configuration UI.
- **TribeStats**: Fetches and displays system stats.
- **TribeAutoJoin**: Handles automatic joining via URL parameters.

### Frontend Flow
1. User navigates to multiplayer section, triggering `TribePages.show("menu")`.
2. Socket connects via `TribeSocket.connect()`.
3. User creates or joins a room, updating `TribeState`.
4. In lobby, components like `TribeUserList` and `TribeChat` render real-time data.
5. Race starts: `TribeCountdown` shows timer, `TribeBars` update progress.
6. During race, `TestInput` sends progress to server via `TribeSocket.out.room.progressUpdateOut()`.
7. Results displayed via `TribeResults`, then back to lobby.

Events from server update state and trigger UI changes, e.g., `room_state_changed` calls `TribePages.show("lobby")` or `TribePages.show("race")`.

## Data Management

The Tribes Server uses in-memory data storage with no persistence, meaning all data is lost on server restart. This is suitable for real-time sessions but not for long-term storage.

### Room Store
- **Implementation**: `RoomStore` class in `src/stores/room-store.ts`.
- **Data Structures**: Maps for rooms (`Map<string, Room>`) and socket-to-room mappings (`Map<string, string>`).
- **Operations**:
  - Create room: Generates unique ID, sets leader, initializes config.
  - Add/remove users: Updates room size, handles leadership transfer on leave.
  - State management: Updates room state (LOBBY, RACE_ONGOING, etc.).
  - Config updates: Allows leader to modify settings.
- **Limitations**: No database; rooms exist only in memory. Max 8 users per room.

### Matchmaking Store
- **Implementation**: `MatchmakingStore` in `src/stores/matchmaking-store.ts`.
- **Queues**: Separate queues for different modes (e.g., 15s time, 60s time).
- **Matching Logic**: Finds groups of 2+ players in the same queue, creates a room for them.
- **Data**: Stores player socket IDs in queues.

### Data Flow
- **Incoming Events**: Controllers parse events, call services, which update stores.
- **Outgoing Events**: Services emit events to clients, broadcasting state changes.
- **Real-time Sync**: All clients in a room receive updates via Socket.IO rooms.
- **No Persistence**: Results and stats are not saved server-side; assumed handled by main MonkeyType backend.

### Scalability Notes
- In-memory storage limits scalability; server restart wipes all rooms.
- No clustering or distributed storage; single-instance design.
- For production, consider Redis or database for persistence and scaling.

This documentation provides a comprehensive overview of the Tribes Server's structure, data models, event system, and core functionalities.</content>
<parameter name="filePath">/home/sai/keyboard_duel/monkeytype-duel/packages/tribes-server/tribes server documentation.md