/**
 * Fetch a page and parse it as HTML. Rejects on network errors and non-2xx
 * responses (e.g. an HF error page or Cloudflare challenge), so callers don't
 * scrape a page that isn't the one they asked for.
 */
export async function fetchDocument(
  url: string,
  init?: RequestInit
): Promise<Document> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return new DOMParser().parseFromString(await res.text(), "text/html");
}
