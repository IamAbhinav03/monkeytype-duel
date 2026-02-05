import { io } from "socket.io-client";

// Determine tribes server URL based on environment
function getTribesServerUrl(): string {
  const hostname = window.location.hostname;

  // if (hostname === "monkeytype.com" || hostname === "www.monkeytype.com") {
  //   return "https://tribe.monkeytype.com";
  // }

  // Production
  if (
    hostname === "monkeytype.rbh.makerspace.tools" ||
    hostname === "www.monkeytype.rbh.makerspace.tools"
  ) {
    return "https://tribe.monkeytype.rbh.makerspace.tools";
  }

  // Deployment
  if (
    hostname === "monkeytype-test.rbh.makerspace.tools" ||
    hostname === "www.monkeytype-test.rbh.makerspace.tools"
  ) {
    return "https://tribe.monkeytype-test.rbh.makerspace.tools";
  }

  // Development - use same host as frontend but on port 3005
  // This works for localhost, 127.0.0.1, and LAN IPs (e.g., 192.168.x.x)
  return `http://${hostname}:3005`;
}

console.log(`Looking for Tribes Server at: ${getTribesServerUrl()}`);

export default io(getTribesServerUrl(), {
  autoConnect: false,
  secure: false,
  reconnectionAttempts: 0,
  reconnection: false,
  query: {
    name: "Guest",
  },
});
