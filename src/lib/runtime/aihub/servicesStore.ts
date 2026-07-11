// Module-level external store for the hub's live services + service_links, written by the
// aihub provider's poll loop and read by React via useSyncExternalStore. The provider caches
// the full /api/live snapshot every 3s; the services slice isn't part of the agent roster, so
// it rides this side channel instead of the gateway event pipeline.
//
// Referential stability matters: useSyncExternalStore's getSnapshot MUST return the same
// reference when nothing structural changed, or React re-renders (and can loop). We therefore
// keep a single cached snapshot and only replace it when the structural signature changes.
// `ageS` is intentionally excluded from the signature — it advances every poll and is only a
// cosmetic freshness hint, so including it would churn the store (and the T12-sensitive office)
// every 3s for no visible benefit.

import { useSyncExternalStore } from "react";
import type {
  HubLiveService,
  HubLiveServiceLink,
} from "@/lib/runtime/aihub/types";

export type ServicesSnapshot = {
  services: HubLiveService[];
  serviceLinks: HubLiveServiceLink[];
  generatedAt: string | null;
};

const EMPTY_SNAPSHOT: ServicesSnapshot = {
  services: [],
  serviceLinks: [],
  generatedAt: null,
};

let currentSnapshot: ServicesSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

const serviceSignature = (service: HubLiveService): string =>
  `${service.id}|${service.label}|${service.status}|${service.kind}`;

// ageS excluded on purpose (see file header).
const linkSignature = (link: HubLiveServiceLink): string =>
  `${link.source}|${link.target}|${link.kind}|${link.active ? 1 : 0}|${link.tool ?? ""}`;

// Order-independent: the set of services/links is what matters, not their array order, so a
// reordered-but-equivalent poll keeps the same signature (and the same stable reference).
const snapshotSignature = (snapshot: ServicesSnapshot): string =>
  `S:${snapshot.services
    .map(serviceSignature)
    .sort()
    .join(",")};L:${snapshot.serviceLinks.map(linkSignature).sort().join(",")}`;

let currentSignature = snapshotSignature(EMPTY_SNAPSHOT);

const emit = (): void => {
  for (const listener of listeners) listener();
};

// Called by the provider poll loop with the freshly normalized snapshot slice.
export const publishServicesSnapshot = (next: ServicesSnapshot): void => {
  const nextSignature = snapshotSignature(next);
  if (nextSignature === currentSignature) return;
  currentSnapshot = {
    services: next.services,
    serviceLinks: next.serviceLinks,
    generatedAt: next.generatedAt,
  };
  currentSignature = nextSignature;
  emit();
};

// Clear the store (feed stop / disconnect) so stale services don't linger in the HUD.
export const resetServicesStore = (): void => {
  if (currentSignature === snapshotSignature(EMPTY_SNAPSHOT)) return;
  currentSnapshot = EMPTY_SNAPSHOT;
  currentSignature = snapshotSignature(EMPTY_SNAPSHOT);
  emit();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): ServicesSnapshot => currentSnapshot;

// Non-hook read (for imperative call sites / tests).
export const getServicesSnapshot = (): ServicesSnapshot => currentSnapshot;

// React hook: subscribe to the live services slice. Server render returns the empty snapshot.
export const useServicesSnapshot = (): ServicesSnapshot =>
  useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
