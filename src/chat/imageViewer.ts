import { el } from "../core/Dom";

/**
 * A full-page viewer for chat images, like Slack's: the image as large as
 * fits (never stretched past its real size), who sent it and when, "Open
 * original" for image links or "Save" for uploads, and a click to switch
 * between fit and actual size. Esc, the backdrop or × closes it.
 */

/** Chat images that open in the viewer: uploads and image-link embeds. */
const CHAT_IMAGES = "img.hfx-chat-upload, .hfx-chat-embed img";

export interface ViewerImage {
  src: string;
  alt: string;
  /** Who sent it and when, e.g. "Kestrel · Today, 8:41 PM". */
  caption: string;
  /** An image link's address, for "Open original". */
  original?: string;
}

const EXTENSIONS: Record<string, string> = { jpeg: "jpg", "svg+xml": "svg" };

/** A file name for an uploaded image's data: URL, e.g. "image.png". */
export function uploadFileName(src: string): string {
  const type = src.match(/^data:image\/([\w.+-]+)/i)?.[1]?.toLowerCase();
  return `image.${type ? (EXTENSIONS[type] ?? type) : "png"}`;
}

/** The viewer's details for a chat image: its message's sender and time. */
export function viewerImage(
  img: HTMLImageElement,
  link: HTMLAnchorElement | null
): ViewerImage {
  const group = img.closest(".hfx-gc-group");
  const name = group?.querySelector(".hfx-gc-name")?.textContent?.trim();
  // The line's full time, or the group's short one
  const time =
    img.closest(".hfx-gc-line")?.getAttribute("title") ||
    group?.querySelector(".hfx-gc-time")?.textContent?.trim();
  return {
    src: img.currentSrc || img.src,
    alt: img.alt,
    caption: [name, time].filter(Boolean).join(" · "),
    original: link?.href || undefined,
  };
}

export class ImageViewer {
  private root: HTMLElement | null = null;
  private returnFocus: HTMLElement | null = null;
  private pageOverflow = "";

  constructor(private readonly doc: Document = document) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(image: ViewerImage): void {
    this.close();
    const doc = this.doc;
    this.returnFocus = doc.activeElement as HTMLElement | null;

    const img = el("img", {
      class: "hfx-image-viewer-img",
      src: image.src,
      alt: image.alt,
      referrerpolicy: "no-referrer",
    });
    const stage = el("div", { class: "hfx-image-viewer-stage" }, img);
    const action = image.original
      ? el(
          "a",
          {
            class: "hfx-image-viewer-button",
            href: image.original,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Open original"
        )
      : image.src.startsWith("data:")
        ? el(
            "a",
            {
              class: "hfx-image-viewer-button",
              href: image.src,
              download: uploadFileName(image.src),
            },
            "Save"
          )
        : null;
    const close = el(
      "button",
      {
        type: "button",
        class: "hfx-image-viewer-button hfx-image-viewer-close",
        title: "Close",
        "aria-label": "Close",
      },
      "×"
    );
    const root = el(
      "div",
      {
        class: "hfx-image-viewer",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": image.caption ? `Image: ${image.caption}` : "Image",
      },
      [
        el("div", { class: "hfx-image-viewer-bar" }, [
          el("span", { class: "hfx-image-viewer-caption" }, image.caption),
          el("div", { class: "hfx-image-viewer-actions" }, [action, close]),
        ]),
        stage,
      ]
    );

    close.addEventListener("click", () => this.close());
    // The backdrop around the image closes it; the image itself zooms
    root.addEventListener("click", (event) => {
      if (event.target === root || event.target === stage) this.close();
    });
    const fitsScreen = () =>
      img.naturalWidth <= img.clientWidth + 1 &&
      img.naturalHeight <= img.clientHeight + 1;
    const markZoomable = () =>
      root.classList.toggle("hfx-image-viewer-zoomable", !fitsScreen());
    img.addEventListener("load", markZoomable);
    img.addEventListener("click", () => {
      if (root.classList.contains("hfx-image-viewer-actual")) {
        root.classList.remove("hfx-image-viewer-actual");
      } else if (root.classList.contains("hfx-image-viewer-zoomable")) {
        root.classList.add("hfx-image-viewer-actual");
      }
    });

    this.root = root;
    doc.body.appendChild(root);
    if (img.complete) markZoomable();
    // The page behind stays put while the viewer is open
    this.pageOverflow = doc.documentElement.style.overflow;
    doc.documentElement.style.overflow = "hidden";
    // Captured on the document, so Esc closes the viewer wherever focus is,
    // before a chat window sees it (where Esc minimizes)
    doc.addEventListener("keydown", this.onKey, true);
    close.focus();
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    this.doc.removeEventListener("keydown", this.onKey, true);
    root.remove();
    this.doc.documentElement.style.overflow = this.pageOverflow;
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const root = this.root;
    if (!root) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    // Keep Tab within the viewer's buttons
    if (event.key === "Tab") {
      const stops = Array.from(
        root.querySelectorAll<HTMLElement>("a[href], button")
      );
      if (!stops.length) return;
      const index = stops.indexOf(this.doc.activeElement as HTMLElement);
      const next = event.shiftKey
        ? index <= 0
          ? stops.length - 1
          : index - 1
        : index === -1 || index === stops.length - 1
          ? 0
          : index + 1;
      event.preventDefault();
      stops[next].focus();
    }
  };
}

/**
 * Open the chat images in `container` (the dock) in `viewer` when clicked.
 * Ctrl, ⌘, Shift or Alt-clicking an image link still follows the link.
 */
export function openImagesInViewer(
  container: HTMLElement,
  viewer: ImageViewer
): void {
  container.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const img = target?.closest?.<HTMLImageElement>(CHAT_IMAGES);
    if (!img || !container.contains(img)) return;
    const link = img.closest<HTMLAnchorElement>("a.hfx-chat-embed");
    const modified =
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (link && (modified || event.button !== 0)) return;
    event.preventDefault();
    viewer.open(viewerImage(img, link));
  });
}
