import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import {
  FirebaseClientConfigurationError,
  validateFirebasePublicConfig,
  type FirebasePublicConfig,
} from "./client-config";

const rawConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let configurationError: FirebaseClientConfigurationError | null = null;
let firebaseConfig: FirebasePublicConfig | null = null;
try {
  firebaseConfig = validateFirebasePublicConfig(rawConfig);
} catch (error) {
  if (error instanceof FirebaseClientConfigurationError) configurationError = error;
  else throw error;
}

const app = firebaseConfig
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const assertFirebaseClientConfigured = (): void => {
  if (configurationError) throw configurationError;
};

export const db = app ? getFirestore(app) : (null as unknown as Firestore);
export const auth = app
  ? getAuth(app)
  : ({ currentUser: null } as unknown as Auth);
export const storage = app ? getStorage(app) : (null as unknown as FirebaseStorage);

if (typeof window !== "undefined") {
  void import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) => {
      if (app && await isSupported()) getAnalytics(app);
    })
    .catch(() => undefined);
}
