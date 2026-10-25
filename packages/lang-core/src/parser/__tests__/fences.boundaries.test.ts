import { describe, expect, it } from "vitest";
import { createParser, createStreamingParser, stripFences } from "../parser";
import type { LibraryJSONSchema } from "../types";

const schema: LibraryJSONSchema = {
  $defs: {
    Title: {
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
};

const parser = createParser(schema, "Title");

describe("1.0 fence extraction boundaries (#1440)", () => {
  it("ignores unmatched prose quotes before a real opening fence", () => {
    const code = 'Here is a 12" pizza card:\n```\nroot = Title("Pizza")\n```';
    const result = parser.parse(code);
    expect(result.meta.errors).toEqual([]);
    expect(result.root?.props.text).toBe("Pizza");
  });

  it("does not open a fence from mid-line backticks in prose", () => {
    const code = 'Tip: use ```js for code.\n```openui-lang\nroot = Title("ok")\n```';
    expect(parser.parse(code).root?.props.text).toBe("ok");
  });

  it("preserves unfenced triple-backticks inside strings and comments", () => {
    const code = "root = Title('Wrap code in ``` fences') // fenced with ```";
    expect(stripFences(code)).toBe(code);
    expect(parser.parse(code).root?.props.text).toBe("Wrap code in ``` fences");
  });

  it("does not close an outer fence from a quoted multiline code string", () => {
    const source = '```\nroot = Title("before\n```\nafter")\n```';
    expect(stripFences(source)).toBe('root = Title("before\n```\nafter")\n');
  });

  it("does not open fences inside unfenced double-quoted multiline code", () => {
    const code = 'root = Title("before\n```\nafter")';
    expect(stripFences(code)).toBe(code);
  });

  it("joins multiple genuine fences, leaving external prose behind", () => {
    const source = '```openui-lang\nroot = Title("first")\n```\nNote: more below.\n```\nroot = Title("second")\n```';
    expect(stripFences(source)).toBe('root = Title("first")\n\nroot = Title("second")\n');
    expect(parser.parse(source).root?.props.text).toBe("second");
  });

  it("treats an unclosed streaming fence as the remaining program", () => {
    const source = 'Before\n```openui-lang\nroot = Title("partial")';
    expect(parser.parse(source).root?.props.text).toBe("partial");
  });

  it("recovers when a real fence arrives after stray prose in a stream", () => {
    const stream = createStreamingParser(schema, "Title");
    stream.push('Here is a 12" card:\n```openui-lang\nroot = Title("P');
    const result = stream.push('izza")\n```', true);
    expect(result.meta.errors).toEqual([]);
    expect(result.root?.props.text).toBe("Pizza");
  });
});
