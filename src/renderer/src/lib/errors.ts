// Electron wraps an error from the main process as "Error invoking remote method 'x': Error: message".
// This keeps only the message, which the main process wrote to be read by a person.

const FALLBACK = 'Something went wrong. Please try again.';

export function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) {
    return FALLBACK;
  }

  const message = error.message
    .replace(/^Error invoking remote method '[^']*': /, '')
    .replace(/^[A-Za-z]*Error: /, '')
    .trim();

  return message.length > 0 ? message : FALLBACK;
}
