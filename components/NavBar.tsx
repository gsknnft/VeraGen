import { AccountMenu } from "./AccountMenu";
import Link from "next/link";
import { Brand } from "./Brand";
import { HiggsfieldConnection } from "./HiggsfieldConnection";

export function NavBar({ active }: { active: "studio" | "collections" | "make" }) {
  return (
    <nav className="app-nav" aria-label="Studio navigation">
      <Brand />
      <Link href="/make" aria-current={active === "make" ? "page" : undefined}>
        Make
      </Link>
      <Link href="/studio" aria-current={active === "studio" ? "page" : undefined}>
        Studio
      </Link>
      <Link href="/collections" aria-current={active === "collections" ? "page" : undefined}>
        Mint Lab
      </Link>
      <HiggsfieldConnection />
      <AccountMenu />
    </nav>
  );
}
