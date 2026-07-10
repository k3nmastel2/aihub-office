import type {
  EventFrame,
  GatewayClient,
  GatewayConnectOptions,
  GatewayGapInfo,
  GatewayStatus,
} from "@/lib/gateway/GatewayClient";
import { parseAgentIdFromSessionKey } from "@/lib/gateway/GatewayClient";
import {
  fetchHubLive,
  postHubDismiss,
  postHubNudge,
  probeAihubRuntime,
  resolveAihubHubUrl,
} from "@/lib/runtime/aihub/http";
import { diffSnapshots } from "@/lib/runtime/aihub/diff";
import {
  buildAgentSeeds,
  buildChatHistoryMessages,
  buildModelsListResult,
  buildSessionsListResult,
  buildSessionsPreviewResult,
  buildStatusResult,
  HUB_SESSION_MAIN_KEY,
  normalizeHubSnapshot,
} from "@/lib/runtime/aihub/snapshot";
import type { HubLiveNode, HubLiveSnapshot } from "@/lib/runtime/aihub/types";
import type {
  RuntimeCapability,
  RuntimeEvent,
  RuntimeProvider,
  RuntimeProviderId,
  RuntimeProviderMetadata,
} from "@/lib/runtime/types";

// Providers that push synthetic events on a timer instead of over a WebSocket. The office
// starts/stops the feed via useRuntimeConnection based on connection state.
export interface LiveFeedRuntimeProvider {
  startLiveFeed(): void;
  stopLiveFeed(): void;
}

export const isLiveFeedRuntimeProvider = (
  provider: unknown
): provider is LiveFeedRuntimeProvider => {
  if (!provider || typeof provider !== "object") return false;
  const candidate = provider as Partial<LiveFeedRuntimeProvider>;
  return (
    typeof candidate.startLiveFeed === "function" &&
    typeof candidate.stopLiveFeed === "function"
  );
};

const AIHUB_CAPABILITIES: ReadonlySet<RuntimeCapability> = new Set([
  "agents",
  "sessions",
  "chat",
]);

const POLL_INTERVAL_MS = 3_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export class AihubRuntimeProvider implements RuntimeProvider, LiveFeedRuntimeProvider {
  readonly id: RuntimeProviderId = "aihub";
  readonly label = "AI Hub";
  readonly capabilities = AIHUB_CAPABILITIES;
  readonly metadata: RuntimeProviderMetadata;
  private readonly hubUrl: string;
  private snapshot: HubLiveSnapshot | null = null;
  private snapshotPromise: Promise<HubLiveSnapshot> | null = null;
  private feedPrevSnapshot: HubLiveSnapshot | null = null;
  private feedTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 1;

  constructor(
    readonly client: GatewayClient,
    runtimeUrl: string
  ) {
    this.hubUrl = resolveAihubHubUrl(runtimeUrl);
    this.metadata = {
      id: this.id,
      label: this.label,
      runtimeName: "AI Hub",
      vendor: "AI Hub",
      routeProfile: "aihub",
    };
  }

  connect(_options: GatewayConnectOptions): Promise<void> {
    // HTTP transport — no WebSocket. Just confirm the hub answers with a live snapshot.
    return probeAihubRuntime(this.hubUrl);
  }

  disconnect(): void {
    this.stopLiveFeed();
  }

  async call<T = unknown>(method: string, params: unknown): Promise<T> {
    switch (method) {
      case "status":
        return (await this.callStatus()) as T;
      case "agents.list":
        return (await this.callAgentsList()) as T;
      case "sessions.list":
        return (await this.callSessionsList(params)) as T;
      case "sessions.preview":
        return (await this.callSessionsPreview(params)) as T;
      case "chat.history":
        return (await this.callChatHistory(params)) as T;
      case "chat.send":
        return (await this.callChatSend(params)) as T;
      case "chat.abort":
        return { ok: true } as T;
      case "agents.delete":
        return (await this.callAgentsDelete(params)) as T;
      case "agent.wait":
        return { status: "done" } as T;
      case "models.list":
        return (await this.callModelsList()) as T;
      case "sessions.reset":
        return { ok: true } as T;
      case "config.get":
        return { config: null } as T;
      case "exec.approvals.get":
        return { file: { agents: {} } } as T;
      default:
        throw new Error(`AI Hub runtime does not implement ${method}.`);
    }
  }

  onStatus(handler: (status: GatewayStatus) => void): () => void {
    return this.client.onStatus(handler);
  }

  onGap(handler: (info: GatewayGapInfo) => void): () => void {
    return this.client.onGap(handler);
  }

  onEvent(handler: (event: EventFrame) => void): () => void {
    return this.client.onEvent(handler);
  }

  onRuntimeEvent(_handler: (event: RuntimeEvent) => void): () => void {
    return () => {};
  }

  startLiveFeed(): void {
    if (this.feedTimer !== null) return;
    const tick = async (): Promise<void> => {
      try {
        const nextSnapshot = normalizeHubSnapshot(await fetchHubLive(this.hubUrl));
        const prevSnapshot = this.feedPrevSnapshot;
        this.snapshot = nextSnapshot;
        this.feedPrevSnapshot = nextSnapshot;
        if (prevSnapshot) {
          const frames = diffSnapshots(prevSnapshot, nextSnapshot, this.seq);
          for (const frame of frames) {
            this.client.emitSyntheticEvent(frame);
          }
          this.seq += frames.length;
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[aihub] Live feed poll failed.", error);
        }
      }
    };
    // Immediate baseline populates the cache and diff baseline without emitting frames;
    // the initial roster load runs off the cached snapshot.
    void tick();
    this.feedTimer = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
  }

  stopLiveFeed(): void {
    if (this.feedTimer !== null) {
      clearInterval(this.feedTimer);
      this.feedTimer = null;
    }
  }

  private async ensureSnapshot(): Promise<HubLiveSnapshot> {
    if (this.snapshot) return this.snapshot;
    if (!this.snapshotPromise) {
      this.snapshotPromise = fetchHubLive(this.hubUrl)
        .then((raw) => {
          const snapshot = normalizeHubSnapshot(raw);
          this.snapshot = snapshot;
          return snapshot;
        })
        .finally(() => {
          this.snapshotPromise = null;
        });
    }
    return this.snapshotPromise;
  }

  private findAgentNode(agentId: string | null): HubLiveNode | null {
    if (!agentId || !this.snapshot) return null;
    return (
      this.snapshot.nodes.find(
        (node) => node.id === agentId && node.kind !== "hub"
      ) ?? null
    );
  }

  private async callStatus() {
    return buildStatusResult(await this.ensureSnapshot());
  }

  private async callAgentsList() {
    const snapshot = await this.ensureSnapshot();
    const seeds = buildAgentSeeds(snapshot);
    return {
      defaultId: seeds[0]?.agentId ?? "main",
      mainKey: HUB_SESSION_MAIN_KEY,
      scope: "aihub",
      agents: seeds.map((seed) => ({
        id: seed.agentId,
        name: seed.name,
        role: seed.role,
        hub: seed.hub,
      })),
    };
  }

  private async callSessionsList(params: unknown) {
    const snapshot = await this.ensureSnapshot();
    const agentId = isRecord(params) ? readString(params.agentId) : "";
    return buildSessionsListResult(snapshot, agentId || null);
  }

  private async callSessionsPreview(params: unknown) {
    const snapshot = await this.ensureSnapshot();
    const keys =
      isRecord(params) && Array.isArray(params.keys)
        ? params.keys.filter((key): key is string => typeof key === "string")
        : [];
    return buildSessionsPreviewResult(snapshot, keys);
  }

  private async callChatHistory(params: unknown) {
    const sessionKey = isRecord(params) ? readString(params.sessionKey) : "";
    if (!sessionKey) {
      throw new Error("AI Hub runtime requires sessionKey for chat.history.");
    }
    const snapshot = await this.ensureSnapshot();
    return {
      sessionKey,
      messages: buildChatHistoryMessages(snapshot, sessionKey),
    };
  }

  private async callModelsList() {
    return buildModelsListResult(await this.ensureSnapshot());
  }

  private async callChatSend(params: unknown) {
    const record = isRecord(params) ? params : {};
    const sessionKey = readString(record.sessionKey);
    const message = readString(record.message);
    const runId = readString(record.idempotencyKey) || null;
    if (!sessionKey || !message) {
      throw new Error("AI Hub nudge requires sessionKey and message.");
    }
    await this.ensureSnapshot();
    const node = this.findAgentNode(parseAgentIdFromSessionKey(sessionKey));
    if (!node) {
      throw new Error(`AI Hub has no live agent for ${sessionKey}.`);
    }
    if (!node.canNudge || !node.sessionId) {
      throw new Error(`${node.label} cannot be nudged (no resumable hub session).`);
    }
    await postHubNudge(this.hubUrl, { sessionId: node.sessionId, message });
    return { status: "completed", runId, text: "Nudge delivered to AI Hub." };
  }

  private async callAgentsDelete(params: unknown) {
    const record = isRecord(params) ? params : {};
    const agentId = readString(record.agentId) || readString(record.id);
    if (!agentId) {
      throw new Error("AI Hub dismiss requires an agent id.");
    }
    await this.ensureSnapshot();
    const node = this.findAgentNode(agentId);
    const sessionId = node?.sessionId ?? agentId;
    await postHubDismiss(this.hubUrl, { sessionId });
    return { ok: true };
  }
}
