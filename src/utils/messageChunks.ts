// Telegram rejects messages longer than 4096 characters.
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Joins lines with "\n" into as few messages as possible, each within
 * Telegram's length limit. Lines are never split — callers pass short lines
 * (suggestion texts are capped at 100 chars).
 */
export function chunkLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + 1 + line.length > MAX_MESSAGE_LENGTH) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) chunks.push(current);
  return chunks;
}
