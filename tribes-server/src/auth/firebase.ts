import admin from "firebase-admin";
import { getConfig } from "../config.js";
import Logger from "../utils/logger.js";

let firebaseApp: admin.app.App | undefined;
let isInitialized = false;

// ============================================================================
// Firebase Initialization
// ============================================================================

export function initializeFirebase(): boolean {
  if (isInitialized) return firebaseApp !== undefined;

  const config = getConfig();

  if (!config.firebase.enabled) {
    Logger.warning(
      "Firebase is not configured, authentication will be disabled",
    );
    isInitialized = true;
    return false;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
    });

    Logger.info("Firebase Admin SDK initialized successfully");
    isInitialized = true;
    return true;
  } catch (error) {
    Logger.error(`Failed to initialize Firebase: ${String(error)}`);
    isInitialized = true;
    return false;
  }
}

// ============================================================================
// Token Verification
// ============================================================================

export type DecodedToken = {
  uid: string;
  email?: string;
  name?: string;
};

export type VerifyTokenResult =
  | { success: true; token: DecodedToken }
  | { success: false; error: string };

export async function verifyIdToken(
  idToken: string,
): Promise<VerifyTokenResult> {
  if (!firebaseApp) {
    return {
      success: false,
      error: "Firebase is not initialized",
    };
  }

  try {
    const decodedToken = await firebaseApp.auth().verifyIdToken(idToken);

    return {
      success: true,
      token: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken["name"] as string | undefined,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Token verification failed";
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// Auth Status
// ============================================================================

export function isFirebaseEnabled(): boolean {
  return firebaseApp !== undefined;
}
