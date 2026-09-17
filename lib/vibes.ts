// Vibe presets are quick-fill starting points for the prompt box, not a
// separate exclusive mode — clicking one just fills the textarea, which
// the user can still edit before generating. The id is kept only as a
// display label on the timeline.

export type Vibe =
  | "cinematic-pan"
  | "dance-loop"
  | "talking-head"
  | "action-hero"
  | "retro-film"
  | "product-hold"
  | "custom";

export const VIBE_OPTIONS: { id: Exclude<Vibe, "custom">; label: string; prompt: string }[] = [
  { id: "cinematic-pan", label: "🎬 Cinematic pan", prompt: "Slow cinematic camera pan, dramatic lighting, film grain" },
  { id: "dance-loop", label: "💃 Dance loop", prompt: "Subject dancing energetically, seamless loop, club lighting" },
  { id: "talking-head", label: "🎤 Talking head", prompt: "Subject talking to camera, natural gestures, studio lighting" },
  { id: "action-hero", label: "🦸 Action hero", prompt: "Subject in a dynamic action pose, motion blur, epic score energy" },
  { id: "retro-film", label: "📼 Retro film", prompt: "1970s film stock look, warm tones, handheld camera movement" },
  { id: "product-hold", label: "📦 Product hold", prompt: "Subject holding an object up to camera, studio softbox lighting" },
];

export const VALID_VIBES: Vibe[] = [...VIBE_OPTIONS.map((v) => v.id), "custom"];
