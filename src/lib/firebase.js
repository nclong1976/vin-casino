import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyA5qRJadWeRsYHOFHr0XBPbQxD5WRf7jkg",
  authDomain: "gen-lang-client-0800418734.firebaseapp.com",
  databaseURL: "https://gen-lang-client-0800418734-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gen-lang-client-0800418734",
  storageBucket: "gen-lang-client-0800418734.firebasestorage.app",
  messagingSenderId: "817238231179",
  appId: "1:817238231179:web:b2af811cee518537aa2c8e",
  measurementId: "G-BG3Y33BDZX"
};

// Khởi tạo Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Khởi tạo Auth
export const auth = getAuth(app);

// Khởi tạo Firestore
export const db = getFirestore(app);

// Khởi tạo Realtime Database
export const rtdb = getDatabase(app);

// Khởi tạo Storage
export const storage = getStorage(app);

export default app;
