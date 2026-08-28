export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export class FirebaseClientConfigurationError extends Error {
  readonly code = "firebase/client-config-missing";
}

export function validateFirebasePublicConfig(
  config: Partial<FirebasePublicConfig>,
): FirebasePublicConfig {
  const required = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
  ] as const;

  if (required.some((key) => !config[key]?.trim())) {
    throw new FirebaseClientConfigurationError();
  }

  return { ...config, measurementId: config.measurementId?.trim() || undefined } as FirebasePublicConfig;
}
