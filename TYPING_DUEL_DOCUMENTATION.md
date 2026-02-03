# Typing Duel Mode Documentation

## Overview
The Typing Duel Mode is a custom multiplayer feature in MonkeyType that allows 2-3 players to compete in a structured typing competition. It includes practice rounds, a final duel, live progress sharing, and leaderboard integration.

## Setup
- **Portal Service**: A separate service running on `localhost` that manages user registration and provides endpoints for user data.
- **Tribes Server**: Handles multiplayer logic, live updates, and leaderboard.
- **External Displays**: ESP32 for lighting effects based on WPM, Pi for displaying live stats and leaderboard.

## User Flow

### 1. Code Entry
- User clicks "Change name" in the Tribe menu.
- Enters a one-time code.
- System calls `localhost/portal/get-user?code=<code>` to fetch:
  - `username`: User's name
  - `theme`: Selected theme (defaults to "arch" if none)
  - `userId`: Unique user ID
- User is set with the fetched data and navigates to the Instruction page.

### 2. Instruction Page
- Displays rules for the 30-second typing tests.
- User clicks "Accept" to proceed to Practice Test 1.

### 3. Practice Tests
- **Practice 1 (P1)**: 30-second test, results sent to tribes-server.
- **Practice 2 (P2)**: Another 30-second test, results sent.
- After P2, user automatically joins the Final Lobby.

### 4. Final Lobby
- User waits for an opponent.
- Auto-matching pairs users who have completed P2.

### 5. Duel
- 30-second test with the same text for both users (same seed).
- Live progress shared: username, WPM, accuracy.
- Results determine winner, update leaderboard.

### 6. Post-Duel
- Leaderboard updated.
- User's WPM and position sent to `localhost/portal/update-stats`.

## Technical Implementation

### Frontend (MonkeyType)
- **Pages**: `instruction`, `practice`, `final-lobby`, `duel`.
- **Socket Events**:
  - `sendPracticeResult(userId, wpm, acc, practiceNum)`
  - `joinDuelRoom()`
  - `sendLiveProgress(wpm, acc)`
- **Handlers**:
  - `liveProgress`: Updates opponent stats.
  - `leaderboardUpdate`: Receives leaderboard data.

### Backend (Tribes Server)
- **Events**:
  - `room_practice_result`: Stores practice results.
  - `room_join_duel_room`: Auto-matches users.
  - `room_live_progress`: Broadcasts progress in room.
  - `room_leaderboard_update`: Sends updated leaderboard.
- **Auto-Matching**: Uses a queue to pair waiting users.
- **Same Text**: Shared seed for duel rooms.

### Portal Integration
- **GET /get-user?code=**: Returns user data.
- **POST /update-stats**: Receives WPM and position.

### External Displays
- Connect to tribes-server socket.
- Listen for `room_live_progress` and `room_leaderboard_update`.
- ESP32: Adjusts lighting based on WPM.
- Pi: Displays live stats in MonkeyType UI theme.

## API Reference

### Socket Events (Frontend to Server)
- `room_practice_result`: `{ userId, wpm, acc, practiceNum }`
- `room_join_duel_room`: No data
- `room_live_progress`: `{ wpm, acc }`

### Socket Events (Server to Frontend)
- `room_live_progress`: `{ userId, wpm, acc }`
- `room_leaderboard_update`: `{ leaderboard: [{ userId, name, wpm }] }`

### Portal Endpoints
- `GET /get-user?code=<string>`: `{ username, theme, userId }`
- `POST /update-stats`: `{ userId, wpm, position }`

## Configuration
- Tests: Time mode, 30 seconds, random words.
- Themes: Applied via MonkeyType's theme system.
- Leaderboard: Stored in memory (can be persisted to DB).

## Usage
1. Start Tribes Server and Portal.
2. Open MonkeyType, go to Tribe, enter code.
3. Follow the flow: Instructions → P1 → P2 → Lobby → Duel.
4. View results and leaderboard.

## Future Enhancements
- Persist leaderboard to database.
- Real-time test integration.
- More themes and customizations.</content>
<parameter name="filePath">/home/sai/keyboard_duel/monkeytype-duel/TYPING_DUEL_DOCUMENTATION.md