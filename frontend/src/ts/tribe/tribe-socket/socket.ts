import { io } from "socket.io-client";

// Determine tribes server URL based on environment
function getTribesServerUrl(): string {
  const hostname = window.location.hostname;

  // Production
  if (hostname === "monkeytype.com" || hostname === "www.monkeytype.com") {
    return "https://tribe.monkeytype.com";
  }

  // Development - use same host as frontend but on port 3005
  // This works for localhost, 127.0.0.1, and LAN IPs (e.g., 192.168.x.x)
  return `http://${hostname}:3005`;
}

export default io(getTribesServerUrl(), {
  autoConnect: false,
  secure: false,
  reconnectionAttempts: 0,
  reconnection: false,
  query: {
    name: "Guest",
  },
});
