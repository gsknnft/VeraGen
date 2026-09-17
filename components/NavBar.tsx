import Link from "next/link";

export function NavBar({ active }: { active: "studio" | "collections" }) {
  return (
    <nav style={{ display: "flex", gap: 16, fontSize: "0.85rem" }}>
      <Link href="/" style={{ color: active === "studio" ? "#f2f2f2" : "#777" }}>
        Studio
      </Link>
      <Link href="/collections" style={{ color: active === "collections" ? "#f2f2f2" : "#777" }}>
        Collections
      </Link>
    </nav>
  );
}
