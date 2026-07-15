import { afterEach, describe, expect, it } from "vitest";
import { getOllamaModel, parseOllamaJson } from "./ollama.js";

const originalModel = process.env.OLLAMA_MODEL;

afterEach(() => {
  if (originalModel === undefined) delete process.env.OLLAMA_MODEL;
  else process.env.OLLAMA_MODEL = originalModel;
});

describe("parseOllamaJson", () => {
  it("parses a plain JSON response", () => {
    expect(parseOllamaJson('{"ok":true}')).toEqual({ ok: true });
  });

  it("recovers JSON from a markdown fence", () => {
    expect(parseOllamaJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("recovers a JSON object surrounded by prose", () => {
    expect(parseOllamaJson('Result: {"ok":true} done.')).toEqual({ ok: true });
  });

  it("rejects empty or malformed responses", () => {
    expect(() => parseOllamaJson(" ")).toThrow("empty response");
    expect(() => parseOllamaJson("not json")).toThrow("invalid JSON");
  });
});

describe("getOllamaModel", () => {
  it("defaults to the verified cloud model", () => {
    delete process.env.OLLAMA_MODEL;
    expect(getOllamaModel()).toBe("gpt-oss:120b");
  });

  it("allows an environment override", () => {
    process.env.OLLAMA_MODEL = "gpt-oss:20b";
    expect(getOllamaModel()).toBe("gpt-oss:20b");
  });
});
