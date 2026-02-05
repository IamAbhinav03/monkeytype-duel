import Page from "../../pages/page";
import { qsr } from "../../utils/dom";
import socket from "../../tribe/tribe-socket/socket";

console.log("LOADED: test_tribe.ts - Waiting for page show...");

function initTribeSocketListener(): void {
  console.log("Initializing Tribe Socket Listener...");
  const statusEl = document.getElementById("testTribeStatus");

  function updateStatus(msg: string): void {
    if (statusEl) {
      statusEl.innerHTML += `<div>${new Date().toLocaleTimeString()} - ${msg}</div>`;
    }
    console.log(msg);
  }

  if (!socket.connected) {
    updateStatus("Connecting to Tribe Socket...");
    socket.connect();
  } else {
    updateStatus("Socket already connected: " + socket.id);
  }

  socket.on("connect", () => {
    updateStatus("✅ Tribe socket connected: " + socket.id);

    // Low-level packet logging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const engine = (socket.io as any).engine as
      | {
          on: (
            event: string,
            cb: (data: { type: string; data: unknown }) => void,
          ) => void;
        }
      | undefined;

    if (engine) {
      engine.on("packet", ({ type, data }) => {
        console.log(`%cTI [${type}]`, "background:red;color:white", data);
      });
      engine.on("packetCreate", ({ type, data }) => {
        console.log(`%cTO [${type}]`, "background:blue;color:white", data);
      });
    }

    // Auto-join mkrspc
    const targetRoom = "mkrspc";
    updateStatus(`🤖 Auto-joining room ${targetRoom}...`);
    socket.emit(
      "room_join",
      { roomId: targetRoom, fromBrowser: true },
      (res: { room?: unknown; status?: string }) => {
        if (res?.room !== undefined && res.room !== null) {
          updateStatus(`✅ Auto-joined room ${targetRoom}`);
        } else {
          updateStatus(
            `❌ Failed to auto-join ${targetRoom}: ${res?.status ?? "Unknown error"}`,
          );
          // Retry maybe?
        }
      },
    );
  });

  socket.on("disconnect", (reason) => {
    updateStatus("❌ Tribe socket disconnected: " + reason);
  });

  socket.on("connect_error", (error) => {
    updateStatus("⚠️ Tribe socket connection error: " + error.message);
    console.error(error);
  });

  socket.onAny((event, ...args) => {
    console.log("Tribe Socket Event:", event);
    console.log(`📩 [${event}]`, args);
    updateStatus(`📩 [${event}] received`);
  });

  const btn = document.getElementById("getPublicRoomsBtn");
  if (btn) {
    btn.onclick = () => {
      updateStatus("Out: room_get_public_rooms");
      socket.emit(
        "room_get_public_rooms",
        { page: 0, search: "" },
        (res: { rooms?: unknown[] }) => {
          console.log("Public rooms response:", res);
          updateStatus(`Rx: Public rooms (${res.rooms?.length ?? 0})`);
        },
      );
    };
  }

  const joinBtn = document.getElementById("joinRoomBtn");
  const joinInput = document.getElementById(
    "joinRoomId",
  ) as HTMLInputElement | null;

  if (joinBtn && joinInput) {
    joinBtn.onclick = () => {
      const roomId = joinInput.value.trim();
      if (roomId === "") {
        updateStatus("⚠️ Please enter a room ID");
        return;
      }
      updateStatus(`Out: room_join (${roomId})`);
      socket.emit(
        "room_join",
        { roomId: roomId, fromBrowser: true },
        (res: { room?: unknown; status?: string }) => {
          console.log("Join room response:", res);
          // Check if response has room object (succes) or just status
          if (res?.room !== undefined && res.room !== null) {
            updateStatus(`✅ Joined room ${roomId}`);
          } else {
            updateStatus(`❌ Failed to join room: ${JSON.stringify(res)}`);
          }
        },
      );
    };
  }
}

export const page = new Page({
  id: "rbhTestTribe",
  element: qsr(".page#pageRbhTestTribe"),
  path: "/rbh/test-tribe",
  afterShow: async () => {
    initTribeSocketListener();
  },
  beforeHide: async () => {
    // Keeping socket open for now to debug navigation issues?
    // Uncomment below to strictly clean up
    // socket.disconnect();
    // socket.offAny();
    console.log("Leaving test_tribe page...");
  },
});
