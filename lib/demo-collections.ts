/**
 * Optional demo/test collections (e.g. ApeFathers) suggested in the Make
 * wizard. NEVER a product gate — any holdable token can enter the Your NFT path.
 *
 * Format (comma-separated): network:0xContract:Label
 * Example: ethereum:0xabc…:ApeFathers
 */
export type DemoCollection = {
  network: string;
  contract: string;
  label: string;
};

export function demoCollections(): DemoCollection[] {
  const raw = process.env.VERAGEN_DEMO_COLLECTIONS?.trim();
  if (!raw) return [];
  return raw.split(",").flatMap((part) => {
    const [network, contract, ...labelParts] = part.trim().split(":");
    const label = labelParts.join(":").trim();
    if (!network || !contract || !label) return [];
    if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) return [];
    return [{ network: network.toLowerCase(), contract, label }];
  });
}
