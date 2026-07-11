"use client";

import { useMemo } from "react";

import { Boxes } from "lucide-react";

import {
  mapServiceIdToObject,
  type ServiceObjectKind,
} from "@/lib/aihub/serviceMap";
import type {
  HubLiveService,
  HubLiveServiceLink,
} from "@/lib/runtime/aihub/types";

// Floating HUD card on the aihub floor listing the hub's live services: an online/offline dot,
// the service label, the office zone it maps to, and — when an agent is actively using it — the
// agents in use. Renders only when the hub reports services (honest, appears with real usage).

const OBJECT_ZONE_LABEL: Record<ServiceObjectKind, string> = {
  server_room: "Server Room",
  art: "Art Studio",
  phone_booth: "Phone Booth",
  library: "Library",
  qa_device: "QA Lab",
  atm: "ATM",
};

const isServiceOnline = (service: HubLiveService): boolean => {
  const status = service.status.trim().toLowerCase();
  return (
    status === "online" ||
    status === "up" ||
    status === "healthy" ||
    status === "ready"
  );
};

type ServiceRow = {
  id: string;
  label: string;
  online: boolean;
  zone: string | null;
  users: string[];
};

export function AihubServicesPanel({
  services,
  serviceLinks,
  agentNameById,
}: {
  services: HubLiveService[];
  serviceLinks: HubLiveServiceLink[];
  agentNameById: Record<string, string>;
}) {
  const rows = useMemo<ServiceRow[]>(() => {
    const usersByService = new Map<string, string[]>();
    for (const link of serviceLinks) {
      if (!link.active) continue;
      const list = usersByService.get(link.target) ?? [];
      const name = agentNameById[link.source] ?? link.source;
      if (!list.includes(name)) list.push(name);
      usersByService.set(link.target, list);
    }
    return services.map((service) => {
      const kind = mapServiceIdToObject(service.id);
      return {
        id: service.id,
        label: service.label || service.id,
        online: isServiceOnline(service),
        zone: kind ? OBJECT_ZONE_LABEL[kind] : null,
        users: usersByService.get(service.id) ?? [],
      };
    });
  }, [services, serviceLinks, agentNameById]);

  if (rows.length === 0) return null;

  const onlineCount = rows.filter((row) => row.online).length;

  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-40 w-64 rounded-lg border border-white/10 bg-black/70 p-3 font-mono text-white/85 shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <Boxes className="h-3.5 w-3.5 text-white/50" aria-hidden />
        <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">
          Services
        </span>
        <span className="ml-auto text-[10px] text-white/40">
          {onlineCount}/{rows.length} online
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-2">
            <span
              className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                row.online ? "bg-emerald-400" : "bg-red-400"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-[12px] text-white/90">
                  {row.label}
                </span>
                {row.zone ? (
                  <span className="shrink-0 text-[9px] uppercase tracking-wide text-white/35">
                    {row.zone}
                  </span>
                ) : null}
              </div>
              {row.users.length > 0 ? (
                <div className="truncate text-[10px] text-emerald-300/80">
                  in use by {row.users.join(", ")}
                </div>
              ) : (
                <div className="text-[10px] text-white/30">
                  {row.online ? "idle" : "offline"}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
