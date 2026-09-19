# Bittyverse lane: private experiment

Status: direction and integration boundary; no deployed minting feature.

VeraGen's public product is useful without a collection: image or idea → shot → edit → branded social video. Bittyverse can consume those capabilities through a private lane. Do not embed Bitty-specific economics, artwork, lineage rules or unreleased collection assets in the public landing page or generation adapter.

## The experience

A keeper encounters an egg with a persistent identity. Care and events shape its possibilities. At the appropriate hatch/readiness moment, the lane resolves and reveals the character according to the existing attestation rules. The keeper discovers the result rather than selecting a guaranteed rare outcome from a form.

The current canon does **not** begin a Bitty's life at an NFT purchase. Its documented order is egg → care → readiness → mint. A general-purpose mystery collection could use mint → later reveal; that is a separate lane and must not silently replace Bittyverse's lifecycle. Any change to that order needs an explicit authored decision.

## Still first, then embodiments

The authoritative resolved traits must produce an approved still through the art pipeline. Record the character identity, trait specification, art/asset versions and output hash. Videos, reveal clips, companion animations and social posts derive from that still and refer back to the same identity. Model output alone is not authority to change traits, canon or rarity.

A deterministic spec does not guarantee byte-identical output from a third-party generative model. Preserve the approved artifacts and their hashes; do not promise model-level reproducibility the provider has not established.

Hatch surprise must come from a properly sealed/attested lifecycle. Hiding a precomputed result in browser state is not a secret. Payment, settlement, failed-generation recovery, artifact custody and reveal rules belong in the lane, with an idempotent job identity so retries cannot reroll a character.

Artifacts and support items can have their own generation/drop rules. Keep those distinct from the character's care-governed identity. Existing Mint Lab instant weighted rolls are not a substitute for the character resolver.

## Proposed seam

Input from the lane: character ID, approved generation spec, approved still reference, evidence/attestation reference, art version, output purpose, deduplication key.

Output from the media pipeline: artifact reference/hash, provider request reference, model/version where available, status and failure/recovery evidence. The lane decides whether that artifact can be revealed or attached to a token. No financial or canon authority flows into the generic media engine.

Start with one privately reviewed character still and one derived reveal video. Confirm visual identity and provenance before attempting an automated collection. Existing desired_production references remain quality targets; this document does not claim the layer generator can reproduce them yet.

## Existing decisions

- Monorepo docs/adr/ADR-011-generation-core-and-mint-lane.md: universal generation core; still-first identity; ecosystem lane boundary.
- packages/bittyverse/docs/BITTYVERSE_ENTRY_AND_MINT.md: care before representation; attested readiness and maturation.
- docs/adr/ADR-009-bitty-production-contract-boundary.md and ADR-010: collection/economy and maturation authority.

This is a proposal for connecting those decisions to VeraGen, not an instruction to change them.

