import { describe, it, expect, vi, beforeEach } from "vitest";

// combinedReport.ts is almost entirely PDF drawing against the pdfReport
// primitives + the EcuTestReport body renderer. We stub both so the test
// pins the *logic*: overall-verdict combination, which sections render, and
// the saved filename.

const save = vi.fn();
const ensure = vi.fn((y: number) => y);
const newPage = vi.fn(() => 40);
const rd = { doc: { save }, ensure, newPage };

vi.mock("@/lib/pdfReport", () => ({
  createReportDoc: () => rd,
  drawHeader: vi.fn(),
  drawTitleBlock: vi.fn(() => 40),
  drawJobRow: vi.fn((_rd: unknown, y: number) => y),
  drawFooter: vi.fn(),
  sectionHeading: vi.fn((_rd: unknown, y: number) => y),
  drawStatTiles: vi.fn((_rd: unknown, y: number) => y),
  drawChipGrid: vi.fn((_rd: unknown, y: number) => y),
  drawTable: vi.fn((_rd: unknown, y: number) => y),
  drawParagraph: vi.fn((_rd: unknown, y: number) => y),
  COLOR: new Proxy({}, { get: () => "#000" }),
  CONTENT_W: 500,
}));
vi.mock("@/components/EcuTestReport", () => ({ drawEcuBody: vi.fn((_rd: unknown, y: number) => y) }));

import { generateCombinedReportPdf, generateHydraulicReportPdf } from "@/lib/combinedReport";
import { emptyEcuReportDraft, type EcuReportDraft } from "@/lib/ecuReport";
import { drawEcuBody } from "@/components/EcuTestReport";
import { sectionHeading } from "@/lib/pdfReport";

const t = (k: string) => k;

const ecuFail = (): EcuReportDraft => ({
  ...emptyEcuReportDraft(),
  ident: { ecuName: "ABS X95" },
  dtc: { timestamp: "t", protocol: "UDS", brand: "Renault", gotPositive: true, codes: [{ code: "C1", description: "", rawValue: 1, udsStatus: 0x09 }] },
});

// hydraulicReport parsed shape — minimal "has data + passes".
const hydPass = () => ({ valves: [{ label: "Valve 1", status: "ok" }], motor: null, pressure: null }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateCombinedReportPdf", () => {
  it("saves a filename tagged with the WORST of the two bench verdicts", () => {
    generateCombinedReportPdf({ ecu: ecuFail(), hydraulic: hydPass(), jobNumber: "17500101", t });
    expect(save).toHaveBeenCalledWith("17500101-FULL-FAIL.pdf");
  });

  it("falls back to a dated name with no job number", () => {
    generateCombinedReportPdf({ ecu: null, hydraulic: null, t });
    const name = save.mock.calls[0][0] as string;
    expect(name).toMatch(/^full-report-\d{4}-\d{2}-\d{2}-REPORT\.pdf$/);
  });

  it("renders the ECU section only when the ECU draft has data", () => {
    generateCombinedReportPdf({ ecu: null, hydraulic: hydPass(), t });
    expect(drawEcuBody).not.toHaveBeenCalled();

    vi.clearAllMocks();
    generateCombinedReportPdf({ ecu: ecuFail(), hydraulic: null, t });
    expect(drawEcuBody).toHaveBeenCalledOnce();
  });

  it("starts the hydraulic section on a fresh page", () => {
    generateCombinedReportPdf({ ecu: ecuFail(), hydraulic: hydPass(), t });
    expect(newPage).toHaveBeenCalledOnce();
  });
});

describe("generateHydraulicReportPdf", () => {
  it("names the file after the hydraulic verdict", () => {
    generateHydraulicReportPdf({ hydraulic: hydPass(), jobNumber: "42", t });
    expect(save).toHaveBeenCalledWith(expect.stringMatching(/^42-HYD-(PASS|REVIEW|FAIL)\.pdf$/));
  });

  it("writes an empty-state paragraph when there is no hydraulic data", () => {
    generateHydraulicReportPdf({ hydraulic: null, t });
    expect(sectionHeading).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(expect.stringMatching(/^hydraulic-report-.*-REPORT\.pdf$/));
  });
});
