"use client";

import { useEffect, useMemo } from "react";

import { type GatewayConnectionState, useGatewayConnection } from "@/lib/gateway/GatewayClient";
import { isLiveFeedRuntimeProvider } from "@/lib/runtime/aihub/provider";
import { createRuntimeProvider } from "@/lib/runtime/createRuntimeProvider";
import {
  hasRuntimeCapability,
  type RuntimeCapability,
  type RuntimeProvider,
} from "@/lib/runtime/types";
import type { StudioSettingsCoordinator } from "@/lib/studio/coordinator";

export type RuntimeConnectionState = GatewayConnectionState & {
  provider: RuntimeProvider;
  providerId: RuntimeProvider["id"];
  providerLabel: string;
  providerMetadata: RuntimeProvider["metadata"];
  capabilities: ReadonlySet<RuntimeCapability>;
  supportsCapability: (capability: RuntimeCapability) => boolean;
};

export const useRuntimeConnection = (
  settingsCoordinator: StudioSettingsCoordinator
): RuntimeConnectionState => {
  const gateway = useGatewayConnection(settingsCoordinator);
  const provider = useMemo(
    () => createRuntimeProvider(gateway.activeAdapterType, gateway.client, gateway.gatewayUrl),
    [gateway.activeAdapterType, gateway.client, gateway.gatewayUrl]
  );
  const capabilities = provider.capabilities;

  // Live-feed providers (AI Hub) poll their source and push synthetic events while
  // connected. Keyed on provider identity + status so a reconnect or floor switch that
  // recreates the provider cleanly stops the old feed and starts the new one.
  useEffect(() => {
    if (gateway.status !== "connected" || !isLiveFeedRuntimeProvider(provider)) {
      return;
    }
    provider.startLiveFeed();
    return () => {
      provider.stopLiveFeed();
    };
  }, [provider, gateway.status]);

  return {
    ...gateway,
    provider,
    providerId: provider.id,
    providerLabel: provider.label,
    providerMetadata: provider.metadata,
    capabilities,
    supportsCapability: (capability) => hasRuntimeCapability(capabilities, capability),
  };
};
