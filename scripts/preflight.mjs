// Configuration checks only: no database, bucket, provider or paid API calls.
const issues = [];
const required = ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "VERAGEN_SESSION_SECRET", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "HIGGSFIELD_MEDIA_HOSTS"];
for (const key of required) if (!process.env[key]) issues.push(key + " is missing");
if (process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length < 32) issues.push("BETTER_AUTH_SECRET must have at least 32 random characters");
if (!/^[a-f0-9]{64}$/i.test(process.env.VERAGEN_SESSION_SECRET ?? "")) issues.push("VERAGEN_SESSION_SECRET must be 32 random bytes encoded as hex");
if (!process.env.BETTER_AUTH_URL?.startsWith("https://")) issues.push("BETTER_AUTH_URL must be the HTTPS public origin");
if (!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) && !(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)) issues.push("Configure at least one OAuth provider");
if (process.env.VERAGEN_DEV_USER) issues.push("Remove VERAGEN_DEV_USER from deployment configuration");
if (process.env.ENABLE_SERVER_EXPORTS === "true") issues.push("Server rendering is enabled: verify worker capacity and cost limits before launch");
console.log(issues.length ? issues.map(x => "- " + x).join("\n") : "Required settings present. Still verify OAuth callbacks, migrations, private bucket policy, CORS and the funded user test.");
process.exitCode = issues.length ? 1 : 0;

