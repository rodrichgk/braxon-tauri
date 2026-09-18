import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";
import type { DbConfig } from "@/lib/types";

// `cn` is the app's tiny class-name joiner (no clsx semantics — just
// filter-falsy + space-join). Lock the exact behaviour so a "smart"
// rewrite that starts merging/deduping is caught.

describe("cn", () => {
  it("joins truthy string args with single spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops every falsy value (false, null, undefined, 0, empty string, NaN)", () => {
    expect(cn("a", false, null, undefined, 0, "", Number.NaN, "b")).toBe("a b");
  });

  it("returns an empty string when nothing is truthy", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined, 0, "")).toBe("");
  });

  it("keeps truthy non-strings verbatim (join stringifies them)", () => {
    expect(cn("a", 1, "b")).toBe("a 1 b");
  });

  it("does not collapse or dedupe repeated tokens", () => {
    expect(cn("box", "box", "px-2")).toBe("box box px-2");
  });
});

describe("DbConfig shape (types.ts)", () => {
  it("accepts a fully-populated config object", () => {
    const c: DbConfig = {
      host: "localhost",
      port: 5432,
      database: "braxon",
      username: "postgres",
      password: "secret",
    };
    expect(Object.keys(c).sort()).toEqual(
      ["database", "host", "password", "port", "username"].sort(),
    );
    expect(typeof c.port).toBe("number");
  });
});
