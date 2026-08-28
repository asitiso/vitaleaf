import { auth } from "./client";

export class MemberAuthenticationRequiredError extends Error {}

export async function getCurrentFirebaseIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new MemberAuthenticationRequiredError("Firebase sign-in is required.");
  return user.getIdToken(forceRefresh);
}
