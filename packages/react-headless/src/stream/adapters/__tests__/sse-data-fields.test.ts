import { describe, expect, it } from "vitest";
import { EventType, type AGUIEvent } from "../../../types";
import { sseDataLine } from "../_shared/sseLines";
import { agUIAdapter } from "../ag-ui";
import { openAIAdapter } from "../openai-completions";
import { openAIResponsesAdapter } from "../openai-responses";

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

async function collect(iterable: AsyncIterable<AGUIEvent>): Promise<AGUIEvent[]> {
  const events: AGUIEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("spec-compliant SSE data fields (#1312)", () => {
  it("accepts an optional space after data: but not other fields", () => {
    expect(sseDataLine('data:{"a":1}')).toBe('{"a":1}');
    expect(sseDataLine('data: {"a":1}')).toBe('{"a":1}');
    expect(sseDataLine("data:")).toBe("");
    expect(sseDataLine("event: message")).toBeNull();
    expect(sseDataLine('metadata:{"a":1}')).toBeNull();
  });

  it("parses AG-UI events with no space, split network chunks, and CRLF", async () => {
    const body = '{"type":"RUN_ERROR","message":"provider error"}';
    const events = await collect(
      agUIAdapter().parse(responseFromChunks(["da", "ta:", body.slice(0, 13), body.slice(13) + "\r\n\r\n"])),
    );
    expect(events).toEqual([{ type: EventType.RUN_ERROR, message: "provider error" }]);
  });

  it("parses OpenAI chat completion deltas with or without a space", async () => {
    const first = JSON.stringify({
      choices: [{ delta: { role: "assistant", content: "Hello" }, finish_reason: null }],
    });
    const last = JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] });
    const events = await collect(
      openAIAdapter().parse(responseFromChunks([`data:${first}\n\n`, `data: ${last}\n\n`])),
    );
    expect(events.map((event) => event.type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ]);
    expect(events[1]).toMatchObject({ delta: "Hello" });
  });

  it("parses OpenAI Responses output events with no space", async () => {
    const delta = JSON.stringify({
      type: "response.output_text.delta",
      item_id: "msg",
      delta: "Streaming works",
    });
    const done = JSON.stringify({ type: "response.output_text.done", item_id: "msg" });
    const events = await collect(
      openAIResponsesAdapter().parse(responseFromChunks([
        `data:${delta}\n\n`,
        `data: ${done}\n\n`,
      ])),
    );
    expect(events.map((event) => event.type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ]);
    expect(events[1]).toMatchObject({ messageId: "msg", delta: "Streaming works" });
  });
});
