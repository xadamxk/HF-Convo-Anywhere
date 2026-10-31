/** Helpers for reading the HF page the content script runs on. */

/** The logged-in user's post key from HF's inline script, or null. */
export function getUserPostKey(): string | null {
  return (
    document.head.innerHTML.match(/my_post_key = "([a-f0-9]+)"/)?.pop() || null
  );
}

/**
 * The logged-in user, from the header's "Welcome back" profile link.
 * Returns null when logged out or the link can't be found.
 */
export function getCurrentUser(): { uid: number; username: string } | null {
  const anchor = document.querySelector(
    ".welcome a"
  ) as HTMLAnchorElement | null;
  if (!anchor) return null;

  return {
    uid: getUidFromHref(anchor.getAttribute("href")),
    username: (anchor.textContent || "").trim(),
  };
}

/**
 * Read the `uid` query parameter from a relative or absolute link, e.g. a
 * `member.php?action=profile&uid=123` profile link. Returns 0 if missing.
 */
export function getUidFromHref(href: string | null | undefined): number {
  if (!href) return 0;
  try {
    const url = new URL(href, "https://hackforums.net/");
    return parseInt(url.searchParams.get("uid") || "", 10) || 0;
  } catch {
    return 0;
  }
}

export function addCssToPage(css: string): void {
  const cssElement = document.createElement("style");
  cssElement.textContent = css;
  (document.head || document.documentElement).appendChild(cssElement);
}
