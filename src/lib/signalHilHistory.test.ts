import { describe, it, expect } from "vitest";
import { invoke } from "@tauri-apps/api/tauri";
import { mockTauri } from "@/test/tauri";
import {
  buildSignalHilTestInput,
  parseSignalHilDraft,
  saveSignalHilTest,
  listSignalHilTests,
  deleteSignalHilTest,
  type SignalHilTestRecord,
} from "@/lib/signalHilHistory";
import { emptyEcuReportDraft, type EcuReportDraft } from "@/lib/ecuReport";

const draftWith = (over: Partial<EcuReportDraft>): EcuReportDraft => ({
  ...emptyEcuReportDraft(),
  ...over,
});

describe("buildSignalHilTestInput", () => {
  it("maps ident + manual fields and derives faultCount / currentPeakA", () => {
    const d = draftWith({
      ident: { absRef: "10.0961-1464.3", ecuName: "ABS X95", protocol: "UDS", sendId: "740", recvId: "760" },
      dtc: {
        timestamp: "t", protocol: "UDS", brand: "Renault", gotPositive: true,
        codes: [{ code: "C1391", description: "", rawValue: 1, udsStatus: 0x09 }],
      },
      curve: [{ speedKmh: 50, fl: 50, fr: 50, rl: 50, rr: 50, currentA: 42 }],
      manual: { voltageV: 13.2, notes: "bench check" },
    });

    const input = buildSignalHilTestInput(d, "fail", "1 active fault", { jobNumber: "17500101", jobLabel: "Renault Scénic" }, "Alice");

    expect(input).toMatchObject({
      operator: "Alice",
      verdict: "fail",
      reason: "1 active fault",
      absRef: "10.0961-1464.3",
      ecuName: "ABS X95",
      protocol: "UDS",
      sendId: "740",
      recvId: "760",
      faultCount: 1,
      currentPeakA: 42,
      voltageV: 13.2,
      jobNumber: "17500101",
      jobLabel: "Renault Scénic",
      notes: "bench check",
    });
    // reportJson is a round-trippable snapshot of the whole draft.
    expect(JSON.parse(input.reportJson)).toEqual(d);
  });

  it("collapses empty operator/reason/verdict to undefined", () => {
    const input = buildSignalHilTestInput(emptyEcuReportDraft(), null, "", {}, "");
    expect(input.operator).toBeUndefined();
    expect(input.reason).toBeUndefined();
    expect(input.verdict).toBeUndefined();
    expect(input.faultCount).toBe(0);
    expect(input.currentPeakA).toBeUndefined();
  });
});

describe("parseSignalHilDraft", () => {
  it("recovers the stored draft", () => {
    const d = emptyEcuReportDraft();
    const rec = { reportJson: JSON.stringify(d) } as SignalHilTestRecord;
    expect(parseSignalHilDraft(rec)).toEqual(d);
  });

  it("returns null on corrupt JSON", () => {
    expect(parseSignalHilDraft({ reportJson: "{not json" } as SignalHilTestRecord)).toBeNull();
  });
});

describe("invoke wrappers", () => {
  it("saveSignalHilTest posts the built input to save_signal_hil_test", async () => {
    const tauri = mockTauri({ save_signal_hil_test: (a) => ({ id: "row1", ...(a.input as object) }) });
    const rec = await saveSignalHilTest(emptyEcuReportDraft(), "pass", "clean", { jobNumber: "1" });
    expect(rec.id).toBe("row1");
    expect(tauri.callsTo("save_signal_hil_test")[0]).toHaveProperty("input");
  });

  it("listSignalHilTests forwards search + limit, dropping an empty search", async () => {
    const tauri = mockTauri({ list_signal_hil_tests: () => [] });
    await listSignalHilTests({ search: "", limit: 25 });
    expect(tauri.callsTo("list_signal_hil_tests")[0]).toEqual({ search: undefined, limit: 25 });
    await listSignalHilTests({ search: "scenic" });
    expect(tauri.callsTo("list_signal_hil_tests")[1]).toEqual({ search: "scenic", limit: undefined });
  });

  it("deleteSignalHilTest passes the id", async () => {
    const tauri = mockTauri({ delete_signal_hil_test: () => undefined });
    await deleteSignalHilTest("row9");
    expect(tauri.callsTo("delete_signal_hil_test")).toEqual([{ id: "row9" }]);
  });

  it("propagates a backend error", async () => {
    mockTauri({ list_signal_hil_tests: () => { throw "db down"; } });
    await expect(invoke("list_signal_hil_tests", {})).rejects.toBeTruthy();
  });
});
