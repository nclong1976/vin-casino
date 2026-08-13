import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Khởi tạo Firebase App
const app = initializeApp(firebaseConfig);

// Khởi tạo Auth
export const auth = getAuth(app);

// Khởi tạo Firestore phù hợp với cấu hình
const databaseId = firebaseConfig.firestoreDatabaseId;
export const db = (databaseId && databaseId !== "(default)")
  ? initializeFirestore(app, { databaseId })
  : getFirestore(app);

export default app;
