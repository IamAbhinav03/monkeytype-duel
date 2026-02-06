import { io } from "socket.io-client";
import { getTribesServerUrl } from "../../utils/tribe";

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
