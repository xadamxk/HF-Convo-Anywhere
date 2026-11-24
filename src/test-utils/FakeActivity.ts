import type { TabActivity } from "../chat/tabLeader";

/** A tab's visibility and focus, set by the test. Focused defaults to visible. */
export class FakeActivity implements TabActivity {
  private readonly listeners = new Set<() => void>();

  constructor(
    public visible = false,
    public focused = visible
  ) {}

  isVisible = () => this.visible;
  isFocused = () => this.focused;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Change visibility (and focus, by default the same), telling listeners. */
  set(visible: boolean, focused = visible): void {
    this.visible = visible;
    this.focused = focused;
    this.listeners.forEach((listener) => listener());
  }
}
