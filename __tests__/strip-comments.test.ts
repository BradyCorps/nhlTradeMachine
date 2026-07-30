import { describe, expect, it } from "vitest";
import { stripComments } from "./support/source";

// The canary helper that lets a fix and its own documentation coexist.
describe("stripComments", () => {
  it("removes a line comment", () => {
    expect(stripComments('const a = 1; // gone\nconst b = 2;'))
      .toBe('const a = 1; \nconst b = 2;');
  });

  it("removes a block comment", () => {
    expect(stripComments("a /* gone */ b")).toBe("a   b");
  });

  it("removes a JSX comment", () => {
    expect(stripComments("<div>{/* gone */}</div>")).toBe("<div>{ }</div>");
  });

  // The whole point: the forbidden string survives in the comment explaining
  // its removal, and the canary must not see it.
  it("drops a quoted phrase that lives only in a comment", () => {
    const src = [
      '// CXS2 — "your picks stay tradeable assets" was a blanket claim',
      'const copy = "your remaining picks are untouched";',
    ].join("\n");
    expect(stripComments(src)).not.toContain("your picks stay tradeable assets");
    expect(stripComments(src)).toContain("your remaining picks are untouched");
  });

  // A naive /\/\/.*$/gm strip eats the rest of the line, so this URL became
  // "https: — an assertion failing for a reason nobody would guess.
  it("does not mistake a URL inside a string for a comment", () => {
    const src = 'const site = "https://capandcrease.com/press-box";';
    expect(stripComments(src)).toBe(src);
  });

  it("leaves comment markers inside every kind of string literal", () => {
    expect(stripComments(`const a = 'a // b';`)).toBe(`const a = 'a // b';`);
    expect(stripComments("const a = `a /* b */ c`;")).toBe("const a = `a /* b */ c`;");
  });

  it("survives an escaped quote", () => {
    const src = 'const a = "she said \\"// not a comment\\"";';
    expect(stripComments(src)).toBe(src);
  });

  it("keeps line numbers stable", () => {
    const src = "a\n// x\n/* y\n z */\nb";
    expect(stripComments(src).split("\n")).toHaveLength(src.split("\n").length);
  });

  it("does not glue tokens together when a block comment is removed", () => {
    // `foo/*c*/bar` collapsing to `foobar` would invent a substring.
    expect(stripComments("foo/* c */bar")).not.toContain("foobar");
  });

  it("tolerates an unterminated comment rather than throwing", () => {
    expect(() => stripComments("a /* never closed")).not.toThrow();
    expect(stripComments("a /* never closed").trim()).toBe("a");
  });

  it("leaves ordinary code untouched", () => {
    const src = 'export function f(x: number) {\n  return x / 2;\n}\n';
    expect(stripComments(src)).toBe(src);
  });
});
