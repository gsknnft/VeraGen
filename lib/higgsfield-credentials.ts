import "server-only";
import { currentSession } from "./session";
import { cookies } from "next/headers";
import { openCredentials } from "./higgsfield-session";

export const CREDENTIAL_COOKIE = "veragen-higgsfield";
export async function getHiggsfieldCredentials() {
  const value = (await cookies()).get(CREDENTIAL_COOKIE)?.value;
  const key = value ? openCredentials(value) : null;
  const session = await currentSession();
  return key && session && key.userId === session.user.id && key.sessionId === session.session.id ? key : null;
}
