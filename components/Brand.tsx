import Link from "next/link";
import Image from "next/image";
export function Brand() {
  return <Link href="/" className="brand-link" aria-label="VeraGen home"><Image src="/brand/veragen-logo.svg" alt="VeraGen" width={175} height={36} priority /></Link>;
}
