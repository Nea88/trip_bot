import { escapeHtml } from "./html.js";

// "@name" only makes sense for a real Telegram username; a first-name
// fallback shown with "@" looks like a mention that points nowhere.
export function formatUserName(name: string, isUsername: boolean): string {
  return isUsername ? `@${name}` : name;
}

// HTML mention that pings the user whether or not they have a username
// (message must be sent with parse_mode "HTML").
export function mentionHtml(userId: number, name: string): string {
  return `<a href="tg://user?id=${userId}">${escapeHtml(name)}</a>`;
}
