import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { createLibrary, defineComponent } from "../../library";
import { action, steps } from "../builtins";
import { createParser, createStreamingParser } from "../parser";

const RestrictedButton = defineComponent({
  name: "RestrictedButton",
  description: "A button that may only send a message to the assistant",
  props: z.object({
    label: z.string(),
    onClick: z.union([steps.ToAssistant.ref]).optional(),
  }),
  component: () => null,
});

const UnrestrictedButton = defineComponent({
  name: "UnrestrictedButton",
  description: "A button with an unrestricted action slot",
  props: z.object({
    label: z.string(),
    onClick: action().optional(),
  }),
  component: () => null,
});

const restrictedSchema = createLibrary({
  components: [RestrictedButton],
  root: "RestrictedButton",
}).toJSONSchema();

const unrestrictedSchema = createLibrary({
  components: [UnrestrictedButton],
  root: "UnrestrictedButton",
}).toJSONSchema();

describe("restricted action step slots (#1467)", () => {
  it("accepts a permitted step", () => {
    const result = createParser(restrictedSchema, "RestrictedButton").parse(
      'root = RestrictedButton("Help", @ToAssistant("Show help"))',
    );
    expect(result.meta.errors).toEqual([]);
    expect(result.root?.props.onClick).toMatchObject({
      k: "Comp",
      name: "ToAssistant",
    });
  });

  it("rejects an unlisted built-in step instead of letting it run", () => {
    const result = createParser(restrictedSchema, "RestrictedButton").parse(
      'root = RestrictedButton("Go", @OpenUrl("https://example.com"))',
    );
    expect(result.meta.errors).toContainEqual(
      expect.objectContaining({ code: "step-not-allowed", path: "/onClick" }),
    );
    expect(result.root?.props.onClick).toBeUndefined();
  });

  it("drops only the disallowed steps from a mixed Action plan", () => {
    const result = createParser(restrictedSchema, "RestrictedButton").parse(
      'root = RestrictedButton("Go", Action([@OpenUrl("https://example.com"), @ToAssistant("Help")]))',
    );
    expect(result.meta.errors).toContainEqual(
      expect.objectContaining({ code: "step-not-allowed", path: "/onClick/0" }),
    );
    expect(result.root?.props.onClick).toMatchObject({
      k: "Comp",
      name: "Action",
      args: [{ k: "Arr", els: [{ k: "Comp", name: "ToAssistant" }] }],
    });
  });

  it("enforces the slot for steps resolved from references", () => {
    const result = createParser(restrictedSchema, "RestrictedButton").parse(
      'root = RestrictedButton("Go", go)\ngo = @OpenUrl("https://example.com")',
    );
    expect(result.meta.errors).toContainEqual(
      expect.objectContaining({ code: "step-not-allowed", path: "/onClick" }),
    );
    expect(result.root?.props.onClick).toBeUndefined();
  });

  it("keeps the restriction at stream completion", () => {
    const parser = createStreamingParser(restrictedSchema, "RestrictedButton");
    const result = parser.push(
      'root = RestrictedButton("Go", @OpenUrl("https://example.com"))',
      true,
    );
    expect(result.meta.errors).toContainEqual(
      expect.objectContaining({ code: "step-not-allowed", path: "/onClick" }),
    );
    expect(result.root?.props.onClick).toBeUndefined();
  });

  it("applies the same allowlist to legacy action objects", () => {
    const parser = createParser(restrictedSchema, "RestrictedButton");
    const allowed = parser.parse(
      'root = RestrictedButton("Go", {type: "continue_conversation", context: "ok"})',
    );
    expect(allowed.meta.errors).toEqual([]);
    const blocked = parser.parse(
      'root = RestrictedButton("Go", {type: "open_url", url: "https://example.com"})',
    );
    expect(blocked.meta.errors).toContainEqual(
      expect.objectContaining({ code: "step-not-allowed", path: "/onClick" }),
    );
    expect(blocked.root?.props.onClick).toBeUndefined();
  });

  it("leaves unrestricted action() slots backward-compatible", () => {
    const result = createParser(unrestrictedSchema, "UnrestrictedButton").parse(
      'root = UnrestrictedButton("Go", @OpenUrl("https://example.com"))',
    );
    expect(result.meta.errors).toEqual([]);
    expect(result.root?.props.onClick).toMatchObject({
      k: "Comp",
      name: "OpenUrl",
    });
  });
  it("drops a plan containing only forbidden steps", () => {
    const result = createParser(restrictedSchema, "RestrictedButton").parse(
      'root = RestrictedButton("Go", Action([@OpenUrl("https://a.test"), @OpenUrl("https://b.test")]))',
    );
    expect(result.meta.errors.filter((error) => error.code === "step-not-allowed")).toHaveLength(2);
    expect(result.root?.props.onClick).toBeUndefined();
  });

  it("retains an Action plan containing only permitted steps", () => {
    const result = createParser(restrictedSchema, "RestrictedButton").parse(
      'root = RestrictedButton("Help", Action([@ToAssistant("One"), @ToAssistant("Two")]))',
    );
    expect(result.meta.errors).toEqual([]);
    expect(result.root?.props.onClick).toMatchObject({
      k: "Comp",
      name: "Action",
      args: [
        {
          k: "Arr",
          els: [
            { k: "Comp", name: "ToAssistant" },
            { k: "Comp", name: "ToAssistant" },
          ],
        },
      ],
    });
  });

  it("does not allow mutable state to bypass a restricted action slot", () => {
    const result = createParser(restrictedSchema, "RestrictedButton").parse(
      'root = RestrictedButton("Go", $action)\n$action = {type: "open_url", url: "https://example.com"}',
    );
    expect(result.meta.errors).toContainEqual(
      expect.objectContaining({ code: "step-not-allowed", path: "/onClick" }),
    );
    expect(result.root?.props.onClick).toBeUndefined();
  });

});
