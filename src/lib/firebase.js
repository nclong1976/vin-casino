import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

/**
 * Utility helper to safely retrieve environment variables across environments
 * (Vite browser bundle, Node server runtime, or local process.env)
 */
const getEnv = (key, fallback = "") => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key];
  }
  return fallback;
};

/**
 * Firebase Config Object populated via environment variables with safe defaults
 */
export const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY", "AIzaSyA5qRJadWeRsYHOFHr0XBPbQxD5WRf7jkg"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN", "gen-lang-client-0800418734.firebaseapp.com"),
  databaseURL: getEnv("VITE_FIREBASE_DATABASE_URL", "https://gen-lang-client-0800418734-default-rtdb.asia-southeast1.firebasedatabase.app"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID", "gen-lang-client-0800418734"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET", "gen-lang-client-0800418734.firebasestorage.app"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "817238231179"),
  appId: getEnv("VITE_FIREBASE_APP_ID", "1:817238231179:web:b2af811cee518537aa2c8e"),
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-BG3Y33BDZX"),
};

/**
 * Singleton Pattern Implementation:
 * Ensures Firebase App initialization occurs exactly once across the entire application lifecycle.
 */
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Exported Firebase Service Singletons:
 * - auth: Authentication service
 * - db: Cloud Firestore NoSQL Database
 * - rtdb: Realtime Database
 * - storage: Firebase Cloud Storage
 */
/**
 * The Firebase project has no "(default)" Firestore database provisioned
 * (only AI-Studio-managed databases exist under other ids), so the client
 * must target one of those explicitly instead of relying on the SDK default.
 */
const FIRESTORE_DATABASE_ID = getEnv(
  "VITE_FIRESTORE_DATABASE_ID",
  "ai-studio-vincluba-aae69510-bcd5-4dd5-bc4d-c2d1ff326c0c"
);

export const auth = getAuth(app);
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const rtdb = getDatabase(app, firebaseConfig.databaseURL);
export const storage = getStorage(app);

/**
 * The app's own login (Supabase Auth) is separate from Firebase Auth, but the
 * Firestore/RTDB security rules require `request.auth != null`. Sign in
 * anonymously so every client carries a valid Firebase Auth session and the
 * rules can actually enforce access instead of relying on rules that
 * silently never match.
 */
if (typeof window !== "undefined") {
  signInAnonymously(auth).catch((err) => {
    console.warn("[Firebase] Anonymous sign-in failed:", err?.message || err);
  });
}

export default app;
