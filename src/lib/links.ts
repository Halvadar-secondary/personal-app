export type LinkPart = { text: string; href?: string };

// http(s) only: anything else (javascript:, data:) stays plain text.
const URL_RE = /https?:\/\/[^\s<>"]+/g;
// Sentence punctuation after a link belongs to the sentence.
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Splits text into plain runs and web links, in order. */
export function linkParts(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING, "");
    if (!url) continue;
    const start = m.index;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
