import { Brand } from "@/components/Brand";
import { SignIn } from "@/components/SignIn";
export const dynamic = "force-dynamic";
export default function Page() {
  return <main><Brand /><h1>Your ideas, your studio.</h1><SignIn github={Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)} google={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} /></main>;
}
