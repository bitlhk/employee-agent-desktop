import { describe, expect, it } from "vitest";
import {
  extractOpenAiToolCallEvents,
  extractOpenClawToolEvent,
} from "../src/main/hermes";

describe("extractOpenClawToolEvent", () => {
  it("normalizes OpenClaw tool start events", () => {
    const event = extractOpenClawToolEvent({
      event: "agent",
      stream: "tool",
      session_id: "desk-session",
      data: {
        phase: "start",
        name: "managed_browser_open",
        tool_id: "call-browser",
        args_text: "https://example.com",
      },
    });

    expect(event).toEqual({
      callId: "call-browser",
      hasStableCallId: true,
      name: "managed_browser_open",
      status: "running",
      label: "managed_browser_open",
      preview: "https://example.com",
    });
  });

  it("normalizes OpenClaw tool completion events with results", () => {
    const event = extractOpenClawToolEvent({
      type: "tool.result",
      payload: {
        status: "success",
        tool_name: "managed_browser_extract",
        tool_call_id: "call-extract",
        result: { title: "Doc", lines: 12 },
      },
    });

    expect(event).toEqual({
      callId: "call-extract",
      hasStableCallId: true,
      name: "managed_browser_extract",
      status: "completed",
      label: "managed_browser_extract",
      preview: "managed_browser_extract",
      result: '{\n  "title": "Doc",\n  "lines": 12\n}',
    });
  });

  it("does not classify ordinary assistant deltas as tool events", () => {
    const event = extractOpenClawToolEvent({
      event: "agent",
      stream: "assistant",
      data: {
        name: "assistant",
        delta: "hello",
      },
    });

    expect(event).toBeNull();
  });

  it("marks synthetic fallback ids as unstable", () => {
    const event = extractOpenClawToolEvent({
      event: "agent",
      stream: "tool",
      session_id: "desk-session",
      data: {
        phase: "running",
        name: "search_web",
        preview: "Marvis",
      },
    });

    expect(event).toMatchObject({
      callId: "search_web:desk-session",
      hasStableCallId: false,
      name: "search_web",
      status: "running",
    });
  });
});

describe("extractOpenAiToolCallEvents", () => {
  it("normalizes OpenAI-compatible streaming tool call deltas", () => {
    const state = new Map();

    const first = extractOpenAiToolCallEvents(
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  function: {
                    name: "managed_browser_open",
                    arguments: '{"url":',
                  },
                },
              ],
            },
          },
        ],
      },
      state,
    );

    expect(first).toEqual([
      {
        callId: "call-1",
        hasStableCallId: true,
        name: "managed_browser_open",
        status: "running",
        label: "managed_browser_open",
        preview: '{"url":',
      },
    ]);

    const second = extractOpenAiToolCallEvents(
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: '"https://example.com"}',
                  },
                },
              ],
            },
          },
        ],
      },
      state,
    );

    expect(second[0]).toMatchObject({
      callId: "call-1",
      name: "managed_browser_open",
      status: "running",
      preview: '{"url":"https://example.com"}',
    });

    const done = extractOpenAiToolCallEvents(
      {
        choices: [{ delta: {}, finish_reason: "tool_calls" }],
      },
      state,
    );

    expect(done).toEqual([
      {
        callId: "call-1",
        hasStableCallId: true,
        name: "managed_browser_open",
        status: "completed",
        label: "managed_browser_open",
        preview: '{"url":"https://example.com"}',
      },
    ]);
  });
});
