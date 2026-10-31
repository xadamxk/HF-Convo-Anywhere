import { convoNiceTime } from "../common/timestamps";
import { ImageViewer, openImagesInViewer, uploadFileName } from "./imageViewer";
import { createMessageGroup, createMessageLine } from "./roomLayout";

const ORIGIN = "https://hackforums.net";
const T = 1792540800;
const PNG = "iVBORw0KGgo=";
const GIF = "https://i.imgflip.com/abc.gif";
const KESTREL = { uid: 5, username: "Kestrel", avatar: "", lastActive: 0 };

/** A chat with an uploaded image and an image link from Kestrel, and an input. */
function chat() {
  const upload = createMessageLine(
    {
      text: "",
      image: { type: "png", data: PNG, width: 10, height: 10 },
      dateline: T,
    },
    ORIGIN
  );
  const group = createMessageGroup(
    { uid: KESTREL.uid, dateline: T },
    KESTREL,
    upload,
    ORIGIN
  );
  const link = createMessageLine(
    { text: GIF, embed: GIF, dateline: T },
    ORIGIN
  );
  group.lines.append(link);
  const input = document.createElement("textarea");
  const container = document.createElement("div");
  container.append(group.root, input);
  document.body.replaceChildren(container);
  const viewer = new ImageViewer();
  openImagesInViewer(container, viewer);
  return {
    container,
    viewer,
    input,
    avatar: group.root.querySelector<HTMLImageElement>(".hfx-gc-avatar img")!,
    uploadImg: upload.querySelector<HTMLImageElement>("img.hfx-chat-upload")!,
    linkImg: link.querySelector<HTMLImageElement>(".hfx-chat-embed img")!,
  };
}

const viewerRoot = () =>
  document.querySelector<HTMLElement>(".hfx-image-viewer");
const button = (label: string) =>
  Array.from(
    viewerRoot()!.querySelectorAll<HTMLElement>(".hfx-image-viewer-button")
  ).find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label
  );
const click = (target: Element, init: MouseEventInit = {}) =>
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, ...init })
  );
const key = (target: EventTarget, init: KeyboardEventInit) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  );

afterEach(() => {
  document.querySelectorAll(".hfx-image-viewer").forEach((n) => n.remove());
  document.documentElement.style.overflow = "";
});

describe("image viewer", () => {
  it("opens an uploaded image with who sent it and when, and Save", () => {
    const { uploadImg, viewer } = chat();
    click(uploadImg);

    expect(viewer.isOpen).toBe(true);
    const root = viewerRoot()!;
    expect(root.getAttribute("role")).toBe("dialog");
    expect(root.querySelector("img")!.getAttribute("src")).toBe(
      `data:image/png;base64,${PNG}`
    );
    expect(root.querySelector(".hfx-image-viewer-caption")!.textContent).toBe(
      `Kestrel · ${convoNiceTime(T)}`
    );
    const save = button("Save") as HTMLAnchorElement;
    expect(save.getAttribute("download")).toBe("image.png");
    expect(button("Open original")).toBeUndefined();
  });

  it("opens an image link in the viewer instead of a new tab, with Open original", () => {
    const { linkImg } = chat();
    const followed = click(linkImg);

    expect(followed).toBe(false);
    const open = button("Open original") as HTMLAnchorElement;
    expect(open.href).toBe(GIF);
    expect(open.target).toBe("_blank");
    expect(open.rel).toContain("noopener");
    expect(
      viewerRoot()!.querySelector("img")!.getAttribute("referrerpolicy")
    ).toBe("no-referrer");
  });

  it("still opens an image link in a new tab when Ctrl, ⌘, Shift or Alt-clicked", () => {
    const { linkImg, viewer } = chat();
    for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) {
      expect(click(linkImg, { [modifier]: true })).toBe(true);
      expect(viewer.isOpen).toBe(false);
    }
  });

  it("leaves other images alone", () => {
    const { avatar, viewer } = chat();
    click(avatar);
    expect(viewer.isOpen).toBe(false);
  });

  it("closes on Esc before the chat window sees it", () => {
    const { container, input, uploadImg, viewer } = chat();
    const windowEsc = jest.fn();
    container.addEventListener("keydown", windowEsc);
    click(uploadImg);

    key(input, { key: "Escape" });

    expect(viewer.isOpen).toBe(false);
    expect(viewerRoot()).toBeNull();
    expect(windowEsc).not.toHaveBeenCalled();
    // Once it's closed, Esc reaches the window again
    key(input, { key: "Escape" });
    expect(windowEsc).toHaveBeenCalledTimes(1);
  });

  it("closes on the backdrop and the × button, but not on the image", () => {
    const { uploadImg, viewer } = chat();
    click(uploadImg);
    click(viewerRoot()!.querySelector(".hfx-image-viewer-img")!);
    expect(viewer.isOpen).toBe(true);
    click(viewerRoot()!);
    expect(viewer.isOpen).toBe(false);

    click(uploadImg);
    click(viewerRoot()!.querySelector(".hfx-image-viewer-stage")!);
    expect(viewer.isOpen).toBe(false);

    click(uploadImg);
    (button("Close") as HTMLButtonElement).click();
    expect(viewer.isOpen).toBe(false);
  });

  it("focuses its Close button, and puts focus back when closed", () => {
    const { input, uploadImg } = chat();
    input.focus();
    click(uploadImg);
    expect(document.activeElement).toBe(button("Close"));
    (button("Close") as HTMLButtonElement).click();
    expect(document.activeElement).toBe(input);
  });

  it("keeps Tab within its buttons", () => {
    const { uploadImg } = chat();
    click(uploadImg);
    const save = button("Save")!;
    const close = button("Close")!;

    key(close, { key: "Tab" });
    expect(document.activeElement).toBe(save);
    key(save, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    key(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
  });

  it("switches between fit and actual size when the image is bigger than the screen", () => {
    const { uploadImg } = chat();
    click(uploadImg);
    const root = viewerRoot()!;
    const img = root.querySelector<HTMLImageElement>(".hfx-image-viewer-img")!;
    const size = (natural: number, shown: number) => {
      Object.defineProperty(img, "naturalWidth", {
        value: natural,
        configurable: true,
      });
      Object.defineProperty(img, "naturalHeight", {
        value: natural,
        configurable: true,
      });
      Object.defineProperty(img, "clientWidth", {
        value: shown,
        configurable: true,
      });
      Object.defineProperty(img, "clientHeight", {
        value: shown,
        configurable: true,
      });
      img.dispatchEvent(new Event("load"));
    };

    size(4000, 800);
    expect(root.classList.contains("hfx-image-viewer-zoomable")).toBe(true);
    click(img);
    expect(root.classList.contains("hfx-image-viewer-actual")).toBe(true);
    click(img);
    expect(root.classList.contains("hfx-image-viewer-actual")).toBe(false);

    // One that already fits doesn't zoom
    size(300, 300);
    expect(root.classList.contains("hfx-image-viewer-zoomable")).toBe(false);
    click(img);
    expect(root.classList.contains("hfx-image-viewer-actual")).toBe(false);
  });

  it("stops the page scrolling only while it's open", () => {
    const { uploadImg, viewer } = chat();
    document.documentElement.style.overflow = "auto";
    click(uploadImg);
    expect(document.documentElement.style.overflow).toBe("hidden");
    viewer.close();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("shows one image at a time", () => {
    const { uploadImg, linkImg } = chat();
    click(uploadImg);
    click(linkImg);
    expect(document.querySelectorAll(".hfx-image-viewer")).toHaveLength(1);
    expect(button("Open original")).toBeDefined();
  });
});

describe("uploadFileName", () => {
  it("names the file after the image's type", () => {
    expect(uploadFileName("data:image/png;base64,AA==")).toBe("image.png");
    expect(uploadFileName("data:image/jpeg;base64,AA==")).toBe("image.jpg");
    expect(uploadFileName("data:image/GIF;base64,AA==")).toBe("image.gif");
    expect(uploadFileName("data:,nope")).toBe("image.png");
  });
});
