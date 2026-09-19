import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
const blocked = new BlockList();
for (const [ip, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.168.0.0",16],["192.0.0.0",24],["198.18.0.0",15],["224.0.0.0",4],["240.0.0.0",4]] as const) blocked.addSubnet(ip,prefix,"ipv4");
for (const [ip,prefix] of [["::",128],["::1",128],["fc00::",7],["fe80::",10],["ff00::",8],["::ffff:0:0",96]] as const) blocked.addSubnet(ip,prefix,"ipv6");
export function providerUrl(value: string, hosts: string[]) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isIP(url.hostname) || !hosts.includes(url.hostname)) throw new Error("Unapproved media origin.");
  return url;
}
/**
 * The provider's result host is only knowable from a real, paid response. When
 * it is not on the allowlist, the operator needs its name to fix
 * HIGGSFIELD_MEDIA_HOSTS, and nothing else would surface it: route handlers
 * deliberately show users a generic message. So it is logged here, server-side,
 * as a hostname only. Never the full URL: result URLs are bearer links.
 */
export class UnapprovedMediaHost extends Error {
  constructor(readonly hostname: string) { super("Unapproved media origin."); }
}
export async function downloadProviderVideo(value: string): Promise<Buffer> {
  const hosts = (process.env.HIGGSFIELD_MEDIA_HOSTS ?? "").split(",").map(x => x.trim()).filter(Boolean);
  let url: URL;
  try {
    url = providerUrl(value, hosts);
  } catch (err) {
    let hostname = "(unparseable URL)";
    try { hostname = new URL(value).hostname; } catch {}
    console.warn(
      `[veragen] Refused to fetch a finished generation from "${hostname}": not in HIGGSFIELD_MEDIA_HOSTS (${hosts.length ? hosts.join(", ") : "empty"}). ` +
        "If this is the provider's real output CDN, add it and restart; the clip is preserved and completes on the next status check.",
    );
    throw err instanceof Error && hostname !== "(unparseable URL)" ? new UnapprovedMediaHost(hostname) : err;
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => blocked.check(a.address, a.family === 4 ? "ipv4" : "ipv6"))) throw new Error("Invalid media destination.");
  // Pin the validated address, retaining the original hostname for TLS verification.
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.get(url, { lookup: (_host, options, callback) => {
      if (options.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    } }, response => {
      const max = 64 * 1024 * 1024;
      if (response.statusCode !== 200 || Number(response.headers["content-length"]) > max || !response.headers["content-type"]?.startsWith("video/")) { response.destroy(); reject(new Error("Invalid media response.")); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > max) request.destroy(new Error("Video too large.")); else chunks.push(chunk); });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", () => reject(new Error("Media transfer failed.")));
    });
    const timeout = setTimeout(() => request.destroy(new Error("Media transfer timed out.")), 60000);
    request.on("close", () => clearTimeout(timeout));
    request.on("error", () => reject(new Error("Media transfer failed.")));
  });
}

