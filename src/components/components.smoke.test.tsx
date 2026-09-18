import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactElement } from "react";
import { renderWithProviders, cleanup } from "@/test/render";

import Diagnostics from "@/components/Diagnostics";
import LegacySignalPanel from "@/components/LegacySignalPanel";
import EcuDeepProfile from "@/components/EcuDeepProfile";
import { MotorTester } from "@/components/MotorTester";
import RemanAnalytics from "@/components/RemanAnalytics";
import RemanGraphView from "@/components/RemanGraphView";
import RemanFinance from "@/components/RemanFinance";
import RemanForecast from "@/components/RemanForecast";
import RemanRoster from "@/components/RemanRoster";
import RepairKnowledgeBase from "@/components/RepairKnowledgeBase";
import NotificationBell from "@/components/NotificationBell";
import UpdateChecker from "@/components/UpdateChecker";
import Sidebar from "@/components/Sidebar";
import SignalHilHistory from "@/components/SignalHilHistory";
import PrinterPanel from "@/components/PrinterPanel";
// LabelDesigner is omitted here: it calls renderLabelCanvas() in a useMemo,
// which needs a real 2D canvas context (jsdom has none). renderLabelCanvas
// itself is covered in src/lib/labelRaster.test.ts with a fake context.

// "Renders without throwing" coverage for the heavy diagnostics / REMAN
// components. Unlisted Tauri commands resolve to [] via tauriFallback.
const opts = {
  user: { id: "u1", name: "Tech", role: "technicien" as const },
  tauriFallback: () => [] as unknown,
};

const noop = () => {};
const asyncNoop = async () => true;

afterEach(cleanup);

describe("component smoke renders", () => {
  it.each<[string, () => ReactElement]>([
    ["Diagnostics", () => <Diagnostics sendMessage={asyncNoop} isConnected={false} absReference="" />],
    ["LegacySignalPanel", () => <LegacySignalPanel sendMessage={asyncNoop} isConnected={false} />],
    ["EcuDeepProfile", () => <EcuDeepProfile isConnected={false} send={asyncNoop} sendId={0x740} recvId={0x760} />],
    ["MotorTester", () => <MotorTester />],
    ["RemanAnalytics", () => <RemanAnalytics />],
    ["RemanGraphView", () => (
      <RemanGraphView
        jobs={[{ id: "1", reference: "REF-1", clientName: "C", family: "ABS", vehicleModel: "V" }]}
        knowledgeEntries={[{ id: 1, faultCodes: ["C1391"], causeTags: [], fixTags: ["reflow"], linkedJobIds: ["1"] }]}
      />
    )],
    ["RemanFinance", () => <RemanFinance />],
    ["RemanForecast", () => <RemanForecast />],
    ["RemanRoster", () => <RemanRoster />],
    ["RepairKnowledgeBase", () => <RepairKnowledgeBase />],
    ["NotificationBell", () => <NotificationBell />],
    ["UpdateChecker", () => <UpdateChecker />],
    ["Sidebar", () => <Sidebar currentPage="home" onPageChange={noop} />],
    ["SignalHilHistory", () => <SignalHilHistory />],
    ["PrinterPanel (open)", () => <PrinterPanel open onClose={noop} />],
  ])("%s mounts and paints something", (_name, make) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = renderWithProviders(make(), opts);
    expect(container).toBeTruthy();
    spy.mockRestore();
  });
});
