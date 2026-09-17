import "server-only";
import { cookies } from "next/headers";
import { openCredentials } from "./higgsfield-session";

export const CREDENTIAL_COOKIE = "veragen-higgsfield";
export async function getHiggsfieldCredentials() {
  const value = (await cookies()).get(CREDENTIAL_COOKIE)?.value;
  return value ? openCredentials(value) : null;
}
