import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const SERVER_APP_NAME = "vitaleaf-server";

export class FirebaseAdminConfigurationError extends Error {
  constructor(name?: string) {
    super(name
      ? `${name} is required for Firebase Admin.`
      : "Firebase Admin configuration is required.");
    this.name = "FirebaseAdminConfigurationError";
  }
}

export const requiredFirebaseAdminEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new FirebaseAdminConfigurationError(name);
  return value;
};

export const getServerApp = () => {
  const existing = getApps().find((app) => app.name === SERVER_APP_NAME);
  if (existing) return existing;

  const privateKey = requiredFirebaseAdminEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/gu, "\n");
  return initializeApp({
    credential: cert({
      projectId: requiredFirebaseAdminEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requiredFirebaseAdminEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey,
    }),
  }, SERVER_APP_NAME);
};

export const getAdminFirestore = (): FirebaseFirestore.Firestore =>
  getFirestore(getServerApp());

export const getAdminStorageBucket = () => getStorage(getServerApp())
  .bucket(requiredFirebaseAdminEnv("FIREBASE_STORAGE_BUCKET"));
