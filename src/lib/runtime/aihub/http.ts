// Browser-side helpers that talk to the AI Hub through our Next server proxy
// (`/api/runtime/aihub`). The proxy enforces the host + pathname allowlists; callers here
// only shape requests and unwrap responses.

const AIHUB_PROXY_PATH = "/api/runtime/aihub";

// The AI Hub always speaks HTTP on the hub port. The shared gateway settings can hand aihub
// a `ws://…:18789` URL (the value another adapter uses) because aihub is the first adapter
// whose URL genuinely differs from the shared gateway port. A ws/wss/empty/invalid URL is
// therefore a mis-set value — resolve it to the hub default rather than dialing the gateway.
export const DEFAULT_AIHUB_HUB_URL = "http://127.0.0.1:3000";

export const resolveAihubHubUrl = (value: string): string => {
  const trimmed = (value || "").trim();
  if (!trimmed) return DEFAULT_AIHUB_HUB_URL;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_AIHUB_HUB_URL;
    }
    return trimmed.replace(/\/$/, "");
  } catch {
    return DEFAULT_AIHUB_HUB_URL;
  }
};

export const normalizeHubBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
};

type HubProxyInput = {
  hubUrl: string;
  pathname: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
};

async function requestHub<T = unknown>({
  hubUrl,
  pathname,
  method = "GET",
  body,
  signal,
}: HubProxyInput): Promise<T> {
  const normalized = normalizeHubBaseUrl(hubUrl);
  const response = await fetch(AIHUB_PROXY_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
    signal,
    body: JSON.stringify({
      hubUrl: normalized || undefined,
      pathname,
      method,
      body,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text.trim() || `AI Hub request failed (${response.status}) for ${pathname}.`
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await response.text()) as unknown as T;
  }
  return (await response.json()) as T;
}

export async function fetchHubLive(hubUrl: string, signal?: AbortSignal): Promise<unknown> {
  return requestHub<unknown>({ hubUrl, pathname: "/api/live", method: "GET", signal });
}

export async function postHubNudge(
  hubUrl: string,
  params: { sessionId: string; message: string }
): Promise<unknown> {
  return requestHub({
    hubUrl,
    pathname: "/api/live/nudge",
    method: "POST",
    body: { session_id: params.sessionId, message: params.message },
  });
}

export async function postHubDismiss(
  hubUrl: string,
  params: { sessionId: string }
): Promise<unknown> {
  return requestHub({
    hubUrl,
    pathname: "/api/live/dismiss",
    method: "POST",
    body: { session_id: params.sessionId },
  });
}

export async function probeAihubRuntime(hubUrl: string): Promise<void> {
  const raw = await fetchHubLive(resolveAihubHubUrl(hubUrl));
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { nodes?: unknown }).nodes)) {
    throw new Error("AI Hub /api/live did not return a live snapshot.");
  }
}
