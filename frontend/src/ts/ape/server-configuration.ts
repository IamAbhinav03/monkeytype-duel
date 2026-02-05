import { Configuration } from "@monkeytype/schemas/configuration";
import Ape from ".";
import { promiseWithResolvers } from "../utils/misc";

let config: Configuration | undefined = undefined;

const {
  promise: configurationPromise,
  resolve,
  reject: _reject,
} = promiseWithResolvers<boolean>();

export { configurationPromise };

export function get(): Configuration | undefined {
  return config;
}

export async function sync(): Promise<void> {
  try {
    const response = await Ape.configuration.get();

    if (response.status !== 200) {
      const message = `Could not fetch configuration: ${response.body.message}`;
      console.error(message);
      // Don't reject - just resolve with false so the app can continue
      // This allows the app to work without the main backend (e.g., duel-only mode)
      resolve(false);
      return;
    } else {
      config = response.body.data ?? undefined;
      resolve(true);
    }
  } catch (error) {
    console.error("Failed to fetch configuration:", error);
    // Resolve instead of reject to allow app to continue
    resolve(false);
  }
}
