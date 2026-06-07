import { randomUUID } from "crypto";
import {
  getConnectionConfig,
  getOpenClawAgentId,
  getOpenClawWsUrl,
} from "./config";
import type { ChatCallbacks } from "./hermes";
import type { ChatToolEvent } from "../shared/chat-stream";

export interface OpenClawGatewayChatHandle {
  abort: () => void;
}

function safeSessionLabel(value: string): string {
  return (value || `desk-${Date.now()}-${randomUUID()}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toolResultText(payload: Record<string, unknown>): string {
  const direct =
    stringValue(payload.result) ||
    stringValue(payload.output) ||
    stringValue(payload.content) ||
    stringValue(payload.text);
  if (direct) return direct;
  const value = payload.result;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function toolEventFromPayload(payload: Record<string, unknown>): ChatToolEvent | null {
  const event = stringValue(payload._event);
  if (event === "tool_call") {
    const name =
      stringValue(payload.name) ||
      stringValue(payload.tool) ||
      stringValue(payload.tool_name) ||
      "tool";
    const callId =
      stringValue(payload.id) ||
      stringValue(payload.tool_call_id) ||
      `${name}:${Date.now()}`;
    return {
      callId,
      hasStableCallId: Boolean(payload.id || payload.tool_call_id),
      name,
      status: "running",
      label: name,
      preview:
        stringValue(payload.arguments) ||
        stringValue(payload.args) ||
        stringValue(payload.preview) ||
        name,
    };
  }

  if (event === "tool_result") {
    const name =
      stringValue(payload.name) ||
      stringValue(payload.tool) ||
      stringValue(payload.tool_name) ||
      "tool";
    return {
      callId:
        stringValue(payload.tool_call_id) ||
        stringValue(payload.id) ||
        `tool-result:${Date.now()}`,
      hasStableCallId: Boolean(payload.tool_call_id || payload.id),
      name,
      status: payload.is_error ? "failed" : "completed",
      label: name,
      preview: name,
      result: toolResultText(payload),
    };
  }

  return null;
}

function websocketUrlWithParams(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function hasOpenClawGatewayWsTransport(): boolean {
  const conn = getConnectionConfig();
  return Boolean(conn.openClawDirect && getOpenClawWsUrl());
}

export function sendMessageViaOpenClawGatewayWs(
  message: string,
  cb: ChatCallbacks,
  resumeSessionId?: string,
): OpenClawGatewayChatHandle {
  const conn = getConnectionConfig();
  const wsBaseUrl = getOpenClawWsUrl();
  const agentId = getOpenClawAgentId();
  const sessionId = resumeSessionId || `desk-${Date.now()}-${randomUUID()}`;
  const sessionLabel = safeSessionLabel(sessionId);
  const sessionKey = `agent:${agentId}:main:${sessionLabel}`;
  const accessToken = conn.apiKey || "";
  const WebSocketCtor = (globalThis as typeof globalThis & {
    WebSocket?: new (url: string) => WebSocket;
  }).WebSocket;

  if (!WebSocketCtor) {
    queueMicrotask(() => cb.onError("WebSocket is not available in this runtime"));
    return { abort: () => undefined };
  }

  let finished = false;
  let sent = false;
  let ws: WebSocket | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;

  const finish = (error?: string) => {
    if (finished) return;
    finished = true;
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
    if (error) cb.onError(error);
    else cb.onDone(sessionId);
  };

  const sendChat = () => {
    if (sent || !ws || ws.readyState !== WebSocket.OPEN) return;
    sent = true;
    ws.send(
      JSON.stringify({
        type: "chat",
        message,
        clientRunId: randomUUID(),
        runtimeMode: "fast",
      }),
    );
  };

  try {
    ws = new WebSocketCtor(
      websocketUrlWithParams(wsBaseUrl, {
        access_token: accessToken,
        agentId,
        sessionKey,
      }),
    );
  } catch (error) {
    queueMicrotask(() =>
      cb.onError(error instanceof Error ? error.message : "OpenClaw WS failed"),
    );
    return { abort: () => undefined };
  }

  connectTimer = setTimeout(() => {
    finish("OpenClaw Gateway WS connection timed out");
  }, 20000);

  ws.addEventListener("open", () => {
    // Wait for the server-side proxy to report `ready: true` before sending.
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    if (finished) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }

    if (payload.type === "connected") {
      if (payload.ready === true) {
        if (connectTimer) {
          clearTimeout(connectTimer);
          connectTimer = null;
        }
        sendChat();
      }
      return;
    }

    if (payload.type === "error" || payload.error) {
      const error =
        stringValue(payload.message) ||
        (typeof payload.error === "string"
          ? payload.error
          : stringValue((payload.error as Record<string, unknown>)?.message)) ||
        "OpenClaw Gateway WS error";
      finish(error);
      return;
    }

    const toolEvent = toolEventFromPayload(payload);
    if (toolEvent) {
      cb.onToolEvent?.(toolEvent);
      return;
    }

    if (payload._event === "agent_status" || payload.__status) {
      const label = stringValue(payload.label) || stringValue(payload.__status);
      if (label) cb.onToolProgress?.(label);
      return;
    }

    if (payload.__stream_end || payload.__done) {
      finish();
      return;
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const delta =
      first?.delta && typeof first.delta === "object"
        ? (first.delta as Record<string, unknown>)
        : undefined;

    const reasoning =
      stringValue(delta?.reasoning_content) || stringValue(delta?.reasoning);
    if (reasoning) cb.onReasoningChunk?.(reasoning);

    const content = stringValue(delta?.content);
    if (content) cb.onChunk(content);

    if (first?.finish_reason === "stop") {
      finish();
    }
  });

  ws.addEventListener("error", () => {
    finish("OpenClaw Gateway WS error");
  });

  ws.addEventListener("close", () => {
    if (!finished) finish("OpenClaw Gateway WS closed");
  });

  return {
    abort: () => {
      finish();
    },
  };
}
