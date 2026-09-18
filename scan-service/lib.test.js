import { describe, it, expect } from "vitest";
import {
  ENTITIES,
  ENTITY_LABEL,
  KEY_MAX,
  LABEL_MAX,
  esc,
  parseScanRequest,
  parseScanPath,
  page,
  confirmationLines,
} from "./lib.js";

describe("esc", () => {
  it("escapes the five markup-significant characters", () => {
    expect(esc(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
    expect(esc("plain text")).toBe("plain text");
    expect(esc(42)).toBe("42");
  });
});

describe("parseScanRequest", () => {
  it("accepts a well-formed request and trims / clamps the fields", () => {
    const r = parseScanRequest({ pcId: "  pc-1 ", entity: "job", key: " 17500101 ", label: "x".repeat(LABEL_MAX + 50), source: "y".repeat(50) });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ pcId: "pc-1", entity: "job", key: "17500101" });
    expect(r.value.label).toHaveLength(LABEL_MAX);
    expect(r.value.source).toHaveLength(32);
  });

  it("defaults the source", () => {
    expect(parseScanRequest({ pcId: "p", entity: "abs", key: "k" }).value.source).toBe("phone");
    expect(parseScanRequest({ pcId: "p", entity: "abs", key: "k" }, { defaultSource: "manual" }).value.source).toBe("manual");
  });

  it("rejects a missing pc_id / key", () => {
    expect(parseScanRequest({ entity: "job", key: "k" }).ok).toBe(false);
    expect(parseScanRequest({ pcId: "p", entity: "job" }).ok).toBe(false);
    expect(parseScanRequest({ pcId: "p", entity: "job", key: "   " }).ok).toBe(false);
  });

  it("rejects an unknown entity", () => {
    expect(parseScanRequest({ pcId: "p", entity: "widget", key: "k" }).ok).toBe(false);
    for (const e of ENTITIES) {
      expect(parseScanRequest({ pcId: "p", entity: e, key: "k" }).ok).toBe(true);
    }
  });

  it("only lower-cases the entity when asked", () => {
    expect(parseScanRequest({ pcId: "p", entity: "JOB", key: "k" }).ok).toBe(false);
    expect(parseScanRequest({ pcId: "p", entity: "JOB", key: "k" }, { lowerEntity: true }).ok).toBe(true);
  });

  it("rejects a key over KEY_MAX and accepts one exactly at the limit", () => {
    expect(parseScanRequest({ pcId: "p", entity: "job", key: "k".repeat(KEY_MAX) }).ok).toBe(true);
    expect(parseScanRequest({ pcId: "p", entity: "job", key: "k".repeat(KEY_MAX + 1) }).ok).toBe(false);
  });

  it("tolerates being called with no argument", () => {
    expect(parseScanRequest().ok).toBe(false);
  });
});

describe("parseScanPath", () => {
  it("parses GET /s/<pcId>/<entity>/<key> with label + src query", () => {
    const r = parseScanPath("/s/pc-1/JOB/17500101", new URLSearchParams("label=Renault%20Sc%C3%A9nic&src=camera"));
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ pcId: "pc-1", entity: "job", key: "17500101", label: "Renault Scénic", source: "camera" });
  });

  it("URL-decodes the path segments", () => {
    const r = parseScanPath("/s/pc%2D2/abs/10.0961%2D1464.3");
    expect(r.value).toMatchObject({ pcId: "pc-2", entity: "abs", key: "10.0961-1464.3" });
  });

  it("rejects the wrong path shape", () => {
    expect(parseScanPath("/s/pc-1/job").ok).toBe(false); // too few
    expect(parseScanPath("/s/pc-1/job/key/extra").ok).toBe(false); // too many
    expect(parseScanPath("/other/pc-1/job/key").ok).toBe(false); // wrong prefix
  });

  it("rejects a bad entity even with a valid shape", () => {
    expect(parseScanPath("/s/pc-1/widget/key").ok).toBe(false);
  });

  it("survives an undecodable segment rather than throwing", () => {
    expect(() => parseScanPath("/s/pc-1/job/%E0%A4%A")).not.toThrow();
  });
});

describe("confirmationLines", () => {
  it("shows the entity label and the key (or label) prominently", () => {
    const lines = confirmationLines("job", "", "17500101", { known: true, online: true, hostname: "BENCH-3" });
    expect(lines[0]).toEqual({ text: `${ENTITY_LABEL.job}:`, strong: false });
    expect(lines[1]).toEqual({ text: "17500101", strong: true });
    expect(lines).toHaveLength(2);
  });

  it("prefers the label over the key and drops the trailing colon", () => {
    const lines = confirmationLines("abs", "Citroën C4", "0265244185", { known: true, online: true, hostname: "H" });
    expect(lines[0].text).toBe(ENTITY_LABEL.abs);
    expect(lines[1].text).toBe("Citroën C4");
  });

  it("warns for an unregistered pc_id", () => {
    const lines = confirmationLines("job", "", "k", { known: false, online: false, hostname: null });
    expect(lines.at(-1).text).toMatch(/never registered/);
  });

  it("warns for a known but offline bench PC", () => {
    const lines = confirmationLines("job", "", "k", { known: true, online: false, hostname: "BENCH-3" });
    expect(lines.at(-1).text).toMatch(/BENCH-3 is offline/);
  });
});

describe("page", () => {
  it("renders a full HTML document with the escaped heading and lines", () => {
    const html = page({
      title: "BRAXON — sent",
      accent: "#30d158",
      heading: { icon: "✓", text: "Opening on <BENCH>" },
      lines: [{ text: "Job:", strong: false }, { text: "17500101", strong: true }],
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Opening on &lt;BENCH&gt;");
    expect(html).toContain(`<p class="key">17500101</p>`);
    expect(html).toContain("#30d158");
  });
});
