import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SERVER_APP_NAME = "vitaleaf-server";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Firebase Admin.`);
  return value;
};

const getServerApp = () => {
  const existing = getApps().find((app) => app.name === SERVER_APP_NAME);
  if (existing) return existing;

  const privateKey = required("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/gu, "\n");
  return initializeApp({
    credential: cert({
      projectId: required("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey,
    }),
  }, SERVER_APP_NAME);
};

export const getAdminFirestore = (): FirebaseFirestore.Firestore =>
  getFirestore(getServerApp());
