/**
 * A BroadcastChannel stand-in shared by the "tabs" of a test. Like the real
 * one, a message goes to every other open channel of the same name (not back
 * to the sender), asynchronously, copied, and in the order it was posted.
 */

export interface FakeChannel {
  readonly name: string;
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(data: unknown): void;
  close(): void;
}

import { deserialize, serialize } from "v8";

// jsdom has no structuredClone; Node's serializer copies the same way
// (ArrayBuffers included) and throws on functions, like postMessage
const copy = <T>(value: T): T =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : deserialize(serialize(value));

export class FakeBroadcastBus {
  /** Every message posted, by channel name, for assertions. */
  readonly posted: { name: string; data: any }[] = [];
  private readonly open = new Set<FakeChannel>();

  /** Open a channel, as `new BroadcastChannel(name)`. */
  readonly create = (name: string): FakeChannel => {
    const bus = this;
    let closed = false;
    const channel: FakeChannel = {
      name,
      onmessage: null,
      postMessage(data: unknown) {
        if (closed)
          throw new DOMException("The channel is closed.", "InvalidStateError");
        bus.posted.push({ name, data: copy(data) });
        for (const other of bus.open) {
          if (other === channel || other.name !== name) continue;
          const message = copy(data);
          queueMicrotask(() => {
            if (bus.open.has(other)) other.onmessage?.({ data: message });
          });
        }
      },
      close() {
        closed = true;
        bus.open.delete(channel);
      },
    };
    this.open.add(channel);
    return channel;
  };

  /** Messages posted on `name` of the given type. */
  ofType(name: string, type: string): any[] {
    return this.posted
      .filter((entry) => entry.name === name && entry.data?.type === type)
      .map((entry) => entry.data);
  }
}
