import { AGUIEvent, StreamProtocolAdapter } from "../../types";
import { sseDataLine, sseLineIterator } from "./_shared/sseLines";

export const agUIAdapter = (): StreamProtocolAdapter => ({
  async *parse(response: Response): AsyncIterable<AGUIEvent> {
    for await (const line of sseLineIterator(response)) {
      const data = sseDataLine(line);
      if (data === null) continue;
      if (!data || data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        yield event as AGUIEvent;
      } catch (e) {
        console.error("Failed to parse SSE event", e);
      }
    }
  },
});
