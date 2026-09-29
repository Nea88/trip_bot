import { escapeHtml } from "./html.js";

const MIN_DESCRIPTION = 3;
const MAX_DESCRIPTION = 200;
const MAX_URL = 1000;

export const ADD_LINK_USAGE =
  "Использование: /addlink <ссылка> <описание>, например:\n/addlink https://example.com/map Карта заправок по трассе";

/** "/addlink <url> <description>" → the parts, or what's wrong with them. */
export function parseAddLink(text: string): { url: string; description: string } | { error: string } {
  const trimmed = text.trim();
  const space = trimmed.search(/\s/);
  if (!trimmed || space === -1) return { error: ADD_LINK_USAGE };
  const url = trimmed.slice(0, space);
  const description = trimmed.slice(space + 1).trim().replace(/\s+/g, " ");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: `Не похоже на ссылку: "${url}". Ссылка должна начинаться с http:// или https://.\n${ADD_LINK_USAGE}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: `Ссылка должна начинаться с http:// или https://.\n${ADD_LINK_USAGE}` };
  }
  if (url.length > MAX_URL) return { error: "Слишком длинная ссылка." };
  if (description.length < MIN_DESCRIPTION) {
    return { error: `Добавьте описание — хотя бы ${MIN_DESCRIPTION} символа, чтобы было понятно, что по ссылке.\n${ADD_LINK_USAGE}` };
  }
  if (description.length > MAX_DESCRIPTION) {
    return { error: `Слишком длинное описание (максимум ${MAX_DESCRIPTION} символов) — сократите его.` };
  }
  return { url, description };
}

// Same page = same link: ignore case of the host, "www.", trailing slash and #fragment.
export function normalizeUrl(url: string): string {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${path}${u.search}`;
}

export interface ListedLink {
  seq: number;
  url: string;
  description: string;
}

/** The /links message (HTML): numbered descriptions that open the links. */
export function formatLinks(links: ListedLink[]): string[] {
  const intro = "🔗 Полезные ссылки группы:";
  const outro = "Предложить свою: /addlink <ссылка> <описание>";
  if (links.length === 0) return ["Полезных ссылок пока нет.", outro];
  return [
    intro,
    ...links.map((l) => `#${l.seq} <a href="${escapeHtml(l.url)}">${escapeHtml(l.description)}</a>`),
    "",
    outro,
  ];
}
