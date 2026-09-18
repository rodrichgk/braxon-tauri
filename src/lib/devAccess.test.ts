import { describe, it, expect } from "vitest";
import {
  isDevUser,
  parseHiddenPages,
  HIDEABLE_PAGES,
  HIDDEN_PAGES_KEY,
} from "@/lib/devAccess";
import type { AppUser } from "@/contexts/SessionContext";

const devById: AppUser = { id: "2e1c8ded-970e-4f0a-adfd-aa266dce53df", name: "Gabhy" };

describe("isDevUser", () => {
  it("is false for a missing user", () => {
    expect(isDevUser(null)).toBe(false);
    expect(isDevUser(undefined)).toBe(false);
  });

  it("matches the pinned AppUser id", () => {
    expect(isDevUser(devById)).toBe(true);
  });

  it("falls back to the REMAN tech id when the uuid does not match", () => {
    expect(isDevUser({ id: "some-other-uuid", name: "Gabhy", remanTechId: "3569" })).toBe(true);
  });

  it("is false for a non-dev account with no matching tech id", () => {
    expect(isDevUser({ id: "other", name: "Bob", remanTechId: "9999" })).toBe(false);
    expect(isDevUser({ id: "other", name: "Bob" })).toBe(false);
    expect(isDevUser({ id: "other", name: "Bob", remanTechId: null })).toBe(false);
  });
});

describe("HIDEABLE_PAGES integrity", () => {
  it("never includes 'home' (there must always be a landing page)", () => {
    expect(HIDEABLE_PAGES).not.toContain("home");
  });

  it("is the exact known set of in-dev pages", () => {
    expect([...HIDEABLE_PAGES].sort()).toEqual(
      [
        "valves", "motors", "signal", "jobs", "reman",
        "f2evo_hydraulic", "f2evo_electronics", "f2evo_gearbox", "f2evo_sensor", "f2evo_washing",
        "cluster_bench",
      ].sort(),
    );
  });

  it("has no duplicates", () => {
    expect(new Set(HIDEABLE_PAGES).size).toBe(HIDEABLE_PAGES.length);
  });

  it("exposes the shared AppSetting key", () => {
    expect(HIDDEN_PAGES_KEY).toBe("hidden_pages");
  });
});

describe("parseHiddenPages", () => {
  it("returns [] for empty / nullish input", () => {
    expect(parseHiddenPages(null)).toEqual([]);
    expect(parseHiddenPages(undefined)).toEqual([]);
    expect(parseHiddenPages("")).toEqual([]);
  });

  it("parses a valid JSON array of known page ids", () => {
    expect(parseHiddenPages('["valves","reman","motors"]')).toEqual(["valves", "reman", "motors"]);
  });

  it("filters out unknown page ids and non-hideable pages ('home')", () => {
    expect(parseHiddenPages('["valves","home","bogus","f2evo_sensor"]')).toEqual([
      "valves",
      "f2evo_sensor",
    ]);
  });

  it("returns [] for valid JSON that is not an array", () => {
    expect(parseHiddenPages('{"valves":true}')).toEqual([]);
    expect(parseHiddenPages("null")).toEqual([]);
    expect(parseHiddenPages("42")).toEqual([]);
    expect(parseHiddenPages('"valves"')).toEqual([]);
  });

  it("returns [] for un-parseable garbage", () => {
    expect(parseHiddenPages("{not json")).toEqual([]);
    expect(parseHiddenPages("[1, 2, ")).toEqual([]);
  });

  it("drops non-string array members without throwing", () => {
    expect(parseHiddenPages('["valves", 3, null, {"x":1}, "motors"]')).toEqual([
      "valves",
      "motors",
    ]);
  });
});
