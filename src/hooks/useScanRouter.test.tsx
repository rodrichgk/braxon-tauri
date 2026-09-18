import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScanRouter } from "@/hooks/useScanRouter";
import { TestSessionProvider, useTestSession } from "@/contexts/TestSessionContext";
import { SCAN_ROUTES } from "@/lib/braxonScan";
import { mockTauri } from "@/test/tauri";

describe("useScanRouter", () => {
  it("stashes the scan as pending and navigates to the entity's route", () => {
    mockTauri({ braxon_client_identity: () => { throw "x"; } });
    const navigateTo = vi.fn();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TestSessionProvider navigateTo={navigateTo}>{children}</TestSessionProvider>
    );

    const { result } = renderHook(
      () => ({ route: useScanRouter(), session: useTestSession() }),
      { wrapper },
    );

    act(() => result.current.route({ entity: "job", key: "17500101", label: "Renault" }));
    expect(navigateTo).toHaveBeenCalledWith(SCAN_ROUTES.job);
    expect(result.current.session.pendingScan).toMatchObject({ entity: "job", key: "17500101", label: "Renault" });

    act(() => result.current.route({ entity: "abs", key: "10.0961" }));
    expect(navigateTo).toHaveBeenLastCalledWith(SCAN_ROUTES.abs);
  });
});
