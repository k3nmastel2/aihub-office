import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AihubRuntimeRequestBody = {
  hubUrl?: string;
  pathname?: string;
  method?: string;
  body?: unknown;
};

const DEFAULT_AIHUB_URL = "http://127.0.0.1:3000";
const DEFAULT_ALLOWLIST = "127.0.0.1,localhost";
// The hub side-effecting endpoints are intentionally the only writable paths; everything
// else (including arbitrary hub routes) is rejected before any request is made.
const ALLOWED_PATHNAMES = new Set(["/api/live", "/api/live/nudge", "/api/live/dismiss"]);

const isHubUrlAllowed = (hubUrl: string): boolean => {
  const rawAllowlist = (process.env.AIHUB_ALLOWLIST || DEFAULT_ALLOWLIST).trim();
  try {
    const parsed = new URL(hubUrl);
    const allowed = rawAllowlist
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return allowed.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const normalizeHubUrl = (value: string | undefined): string => {
  const trimmed = (value ?? "").trim() || (process.env.AIHUB_URL || DEFAULT_AIHUB_URL);
  const parsed = new URL(trimmed);
  if (parsed.protocol === "ws:") {
    parsed.protocol = "http:";
  } else if (parsed.protocol === "wss:") {
    parsed.protocol = "https:";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("hubUrl must use http, https, ws, or wss.");
  }
  parsed.username = "";
  parsed.password = "";
  const normalized = parsed.toString().replace(/\/$/, "");
  if (!isHubUrlAllowed(normalized)) {
    throw new Error("hubUrl is not in the allowed hosts list.");
  }
  return normalized;
};

const normalizePathname = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("pathname is required.");
  }
  const trimmed = value.trim();
  const pathname = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (!ALLOWED_PATHNAMES.has(pathname)) {
    throw new Error("pathname is not in the allowed list.");
  }
  return pathname;
};

const normalizeMethod = (value: unknown): "GET" | "POST" => {
  if (typeof value !== "string") return "GET";
  return value.trim().toUpperCase() === "POST" ? "POST" : "GET";
};

const BAD_REQUEST_MESSAGES = new Set([
  "pathname is required.",
  "pathname is not in the allowed list.",
  "hubUrl must use http, https, ws, or wss.",
  "hubUrl is not in the allowed hosts list.",
]);

export async function POST(request: Request) {
  let payload: AihubRuntimeRequestBody;
  try {
    payload = (await request.json()) as AihubRuntimeRequestBody;
  } catch (error) {
    console.error("[runtime/aihub] Invalid JSON request body.", error);
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  try {
    const hubUrl = normalizeHubUrl(payload.hubUrl);
    const pathname = normalizePathname(payload.pathname);
    const method = normalizeMethod(payload.method);
    const response = await fetch(`${hubUrl}${pathname}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : null),
      },
      body: method === "POST" ? JSON.stringify(payload.body ?? {}) : undefined,
      cache: "no-store",
      signal: request.signal,
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI Hub proxy failed.";
    const status = BAD_REQUEST_MESSAGES.has(message) ? 400 : 502;
    console.error("[runtime/aihub] Proxy request failed.", error);
    return NextResponse.json(
      { error: status === 400 ? message : "AI Hub proxy failed." },
      { status }
    );
  }
}
