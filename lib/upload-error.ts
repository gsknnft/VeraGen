const messages = new Set([
  "Upload an MP4 or MOV video.", "Videos can be up to 64 MB.", "Storage allowance reached.",
  "Upload not found.", "Upload not found. It may not have finished, or it expired.",
  "That file is not a playable MP4 or MOV video.",
  "Upload could not be verified. Try again.", "Upload changed or could not be saved. Try again.",
]);
export function uploadError(error: unknown) {
  return error instanceof Error && messages.has(error.message)
    ? error.message : "Upload could not be completed. Please try again.";
}
