import { createId } from "../utils/id";
import type { RuntimeEvent } from "../types/runtime";

type RuntimeListener = (event: RuntimeEvent) => void;

export class RuntimeEventBus {
  private readonly listeners = new Set<RuntimeListener>();

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: Omit<RuntimeEvent, "id" | "createdAt">): RuntimeEvent {
    const runtimeEvent: RuntimeEvent = {
      id: createId("evt"),
      createdAt: new Date().toISOString(),
      ...event
    };

    for (const listener of this.listeners) {
      listener(runtimeEvent);
    }

    return runtimeEvent;
  }
}
