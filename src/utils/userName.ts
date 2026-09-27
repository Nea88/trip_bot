// "@name" only makes sense for a real Telegram username; a first-name
// fallback shown with "@" looks like a mention that points nowhere.
export function formatUserName(name: string, isUsername: boolean): string {
  return isUsername ? `@${name}` : name;
}
