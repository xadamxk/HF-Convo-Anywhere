import type { RelaySocket } from "../chat/SharedSocket";
import { FakeConvoSocket } from "./FakeConvoSocket";

/**
 * The real socket a SharedSocket's leading tab opens. It reports every
 * event to onAny, and tests open and drop it like a server.
 */
export class FakeRelaySocket extends FakeConvoSocket implements RelaySocket {
  private readonly any: ((event: string, ...args: any[]) => void)[] = [];

  onAny(handler: (event: string, ...args: any[]) => void): this {
    this.any.push(handler);
    return this;
  }

  connect(): void {
    this.connects++;
  }

  disconnect(): void {
    const was = this.connected;
    super.disconnect();
    if (was) this.fire("disconnect", "io client disconnect");
  }

  /** The server accepted the connection. */
  open(): void {
    this.connected = true;
    this.fire("connect");
  }

  fire(event: string, ...args: unknown[]): void {
    super.fire(event, ...args);
    this.any.forEach((handler) => handler(event, ...args));
  }
}
