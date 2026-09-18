import { describe, it, expect, vi, beforeEach } from "vitest";

const { isoTpRequest } = vi.hoisted(() => ({ isoTpRequest: vi.fn() }));
vi.mock("@/lib/isotp", async (orig) => {
  const actual = await orig<typeof import("@/lib/isotp")>();
  return { ...actual, isoTpRequest };
});

import {
  dbProbes,
  rangeProbes,
  protocolFromProbe,
  dedupeProbes,
  estimateSweepSeconds,
  runDiscovery,
  SESSION_PROBES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_GAP_MS,
} from "@/lib/ecuDiscovery";

beforeEach(() => isoTpRequest.mockReset());

describe("dbProbes", () => {
  it("keeps the explicit recv id when present", () => {
    const [p] = dbProbes([{ sendId: "0x740", recvId: "0x760", source: "saved", label: "MK61" }]);
    expect(p).toMatchObject({ sendId: 0x740, recvIds: [0x760], tier: "db", source: "saved", label: "MK61" });
  });

  it("falls back to the +0x20 / +0x08 conventions when there is no recv id", () => {
    const [p] = dbProbes([{ sendId: "0x740", recvId: "", source: "db", label: "" }]);
    expect(p.recvIds).toEqual([0x760, 0x748]);
  });

  it("skips a row with an unparseable send id", () => {
    expect(dbProbes([{ sendId: "nope", recvId: "0x760", source: "db", label: "" }])).toEqual([]);
  });
});

describe("rangeProbes", () => {
  it("emits one probe per id, listening on both recv conventions inside 0x7FF", () => {
    expect(rangeProbes(0x700, 0x701, "full")).toEqual([
      { sendId: 0x700, recvIds: [0x720, 0x708], tier: "full" },
      { sendId: 0x701, recvIds: [0x721, 0x709], tier: "full" },
    ]);
  });

  it("drops a recv id that would exceed 0x7FF", () => {
    // 0x7E0 + 0x20 = 0x800 is out of range; only the +8 conv survives
    expect(rangeProbes(0x7e0, 0x7e0, "full")[0].recvIds).toEqual([0x7e8]);
  });
});

describe("protocolFromProbe", () => {
  it("is UDS only for a 50 response carrying the P2 timing bytes", () => {
    expect(protocolFromProbe([0x50, 0x03, 0x00, 0x32, 0x01, 0xf4])).toBe("UDS");
    expect(protocolFromProbe([0x50, 0x03])).toBe("KWP2000"); // positive but short
    expect(protocolFromProbe([0x7f, 0x10, 0x22])).toBe("KWP2000"); // negative says nothing
  });
});

describe("dedupeProbes", () => {
  it("keeps the first probe per send id", () => {
    const out = dedupeProbes([
      { sendId: 0x740, recvIds: [0x760], tier: "db" },
      { sendId: 0x760, recvIds: [0x768], tier: "full" },
      { sendId: 0x740, recvIds: [0x748], tier: "full" },
    ]);
    expect(out.map((p) => p.sendId)).toEqual([0x740, 0x760]);
  });
});

describe("estimateSweepSeconds", () => {
  it("is count x probes x (timeout + gap), rounded to seconds", () => {
    expect(estimateSweepSeconds(10)).toBe(
      Math.round((10 * SESSION_PROBES.length * (DEFAULT_TIMEOUT_MS + DEFAULT_GAP_MS)) / 1000),
    );
    expect(estimateSweepSeconds(0)).toBe(0);
  });
});

describe("runDiscovery", () => {
  const probe = { sendId: 0x740, recvIds: [0x760], tier: "db" as const, label: "MK61" };

  it("returns null with no probes", async () => {
    expect(await runDiscovery({ send: vi.fn(), probes: [] })).toBeNull();
  });

  it("resolves the first address that accepts a session (50 xx)", async () => {
    isoTpRequest.mockResolvedValueOnce({ payload: [0x50, 0xc0, 0, 0x32, 0x01, 0xf4], fromId: 0x760, pending: false });
    const hit = await runDiscovery({ send: vi.fn(), probes: [probe], gapMs: 0 });
    expect(hit).toMatchObject({
      sendId: 0x740,
      recvId: 0x760,
      subFunction: SESSION_PROBES[0][1],
      sessionOpen: true,
      label: "MK61",
    });
    expect(hit?.nrc).toBeUndefined();
  });

  it("still reports an address that only answers 7F, with sessionOpen:false + nrc", async () => {
    isoTpRequest.mockResolvedValue({ payload: [0x7f, 0x10, 0x22], fromId: 0x760, pending: false });
    const hit = await runDiscovery({ send: vi.fn(), probes: [probe], gapMs: 0 });
    expect(hit).toMatchObject({ sendId: 0x740, sessionOpen: false, nrc: 0x22 });
    // tried all three session subfunctions before giving the 7F verdict
    expect(isoTpRequest).toHaveBeenCalledTimes(SESSION_PROBES.length);
  });

  it("returns null when every probe is silent", async () => {
    isoTpRequest.mockResolvedValue(null);
    expect(await runDiscovery({ send: vi.fn(), probes: [probe], gapMs: 0 })).toBeNull();
  });

  it("bails out immediately when cancelled", async () => {
    isoTpRequest.mockResolvedValue(null);
    const hit = await runDiscovery({ send: vi.fn(), probes: [probe], gapMs: 0, isCancelled: () => true });
    expect(hit).toBeNull();
    expect(isoTpRequest).not.toHaveBeenCalled();
  });

  it("reports progress across the sweep", async () => {
    isoTpRequest.mockResolvedValue(null);
    const onProgress = vi.fn();
    await runDiscovery({ send: vi.fn(), probes: [probe, { ...probe, sendId: 0x741 }], gapMs: 0, onProgress });
    expect(onProgress).toHaveBeenCalled();
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(2); // done === total
    expect(lastCall[1]).toBe(2);
  });
});
