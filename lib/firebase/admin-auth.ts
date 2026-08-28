import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";

import { getAdminFirestore, getServerApp } from "./admin";

type AdminRecord = { role?: unknown } | null;

export type FirebaseAdminAuthDependencies = {
  getAdminRecord(uid: string): Promise<AdminRecord>;
  verifyIdToken(token: string): Promise<DecodedIdToken>;
};

export class ServerAuthenticationError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? "Authentication required." : "Forbidden.");
    this.name = "ServerAuthenticationError";
    this.status = status;
  }
}

export const getAdminAuth = (): Auth => getAuth(getServerApp());

const defaultDependencies: FirebaseAdminAuthDependencies = {
  getAdminRecord: async (uid) => {
    const snapshot = await getAdminFirestore().collection("admins").doc(uid).get();
    return snapshot.exists ? snapshot.data() as AdminRecord : null;
  },
  verifyIdToken: (token) => getAdminAuth().verifyIdToken(token),
};

const bearerToken = (request: Request): string => {
  const authorization = request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/u);
  if (!match) throw new ServerAuthenticationError(401);
  return match[1];
};

export async function verifyBearerMember(
  request: Request,
  dependencies: FirebaseAdminAuthDependencies = defaultDependencies,
): Promise<DecodedIdToken> {
  try {
    return await dependencies.verifyIdToken(bearerToken(request));
  } catch (error) {
    if (error instanceof ServerAuthenticationError) throw error;
    throw new ServerAuthenticationError(401);
  }
}

export async function verifyBearerAdmin(
  request: Request,
  dependencies: FirebaseAdminAuthDependencies = defaultDependencies,
): Promise<DecodedIdToken> {
  const identity = await verifyBearerMember(request, dependencies);
  const admin = await dependencies.getAdminRecord(identity.uid);
  if (admin?.role !== "admin") throw new ServerAuthenticationError(403);
  return identity;
}
