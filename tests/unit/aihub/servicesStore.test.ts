import { beforeEach, describe, expect, it } from "vitest";

import {
  getServicesSnapshot,
  publishServicesSnapshot,
  resetServicesStore,
  type ServicesSnapshot,
} from "@/lib/runtime/aihub/servicesStore";
import type {
  HubLiveService,
  HubLiveServiceLink,
} from "@/lib/runtime/aihub/types";

const service = (over: Partial<HubLiveService> = {}): HubLiveService => ({
  id: "mlx",
  label: "MLX",
  status: "online",
  kind: "service",
  ...over,
});

const link = (over: Partial<HubLiveServiceLink> = {}): HubLiveServiceLink => ({
  source: "a1",
  target: "mlx",
  kind: "uses",
  active: true,
  tool: "mcp__ailab__ailab_health",
  ageS: 1,
  ...over,
});

const snapshot = (over: Partial<ServicesSnapshot> = {}): ServicesSnapshot => ({
  services: [service()],
  serviceLinks: [link()],
  generatedAt: "2026-07-11T00:00:00Z",
  ...over,
});

describe("servicesStore", () => {
  beforeEach(() => {
    resetServicesStore();
  });

  it("starts empty", () => {
    const snap = getServicesSnapshot();
    expect(snap.services).toEqual([]);
    expect(snap.serviceLinks).toEqual([]);
  });

  it("reflects a published snapshot", () => {
    publishServicesSnapshot(snapshot());
    const snap = getServicesSnapshot();
    expect(snap.services).toHaveLength(1);
    expect(snap.services[0].id).toBe("mlx");
    expect(snap.serviceLinks[0].source).toBe("a1");
  });

  it("keeps the same reference when the structural signature is unchanged", () => {
    publishServicesSnapshot(snapshot());
    const first = getServicesSnapshot();
    // Re-publish an equivalent snapshot (new objects, same structure) — reference must hold.
    publishServicesSnapshot(snapshot());
    expect(getServicesSnapshot()).toBe(first);
  });

  it("ignores ageS-only changes (cosmetic freshness, excluded from the signature)", () => {
    publishServicesSnapshot(snapshot({ serviceLinks: [link({ ageS: 1 })] }));
    const first = getServicesSnapshot();
    publishServicesSnapshot(snapshot({ serviceLinks: [link({ ageS: 42 })] }));
    expect(getServicesSnapshot()).toBe(first);
  });

  it("replaces the reference on a structural change (status flip)", () => {
    publishServicesSnapshot(snapshot());
    const first = getServicesSnapshot();
    publishServicesSnapshot(
      snapshot({ services: [service({ status: "offline" })] }),
    );
    const second = getServicesSnapshot();
    expect(second).not.toBe(first);
    expect(second.services[0].status).toBe("offline");
  });

  it("replaces the reference when a service_link becomes inactive", () => {
    publishServicesSnapshot(snapshot());
    const first = getServicesSnapshot();
    publishServicesSnapshot(snapshot({ serviceLinks: [link({ active: false })] }));
    expect(getServicesSnapshot()).not.toBe(first);
  });

  it("clears back to empty on reset", () => {
    publishServicesSnapshot(snapshot());
    resetServicesStore();
    expect(getServicesSnapshot().services).toEqual([]);
    expect(getServicesSnapshot().serviceLinks).toEqual([]);
  });
});
