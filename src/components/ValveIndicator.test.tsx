import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValveIndicator } from "@/components/ValveIndicator";
import type { Valve } from "@/types/abs";

// Reference / template test for a leaf component: no providers needed, just
// render + assert on what a user sees, plus one interaction. Components that
// call `invoke` or use app context want `renderWithProviders` from
// `src/test/render.tsx` instead — see docs/TESTING.md.

const valve = (over: Partial<Valve> = {}): Valve => ({
  id: 1,
  name: "Inlet FL",
  health: 80,
  status: "inactive",
  ...over,
});

describe("<ValveIndicator>", () => {
  it("shows the valve name and health percentage", () => {
    render(<ValveIndicator valve={valve({ name: "Outlet RR", health: 42 })} />);
    expect(screen.getByText("Outlet RR")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("fires onClick", async () => {
    const onClick = vi.fn();
    render(<ValveIndicator valve={valve()} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("colours the health bar by threshold", () => {
    const { rerender } = render(<ValveIndicator valve={valve({ health: 80 })} />);
    expect(document.querySelector(".bg-success")).toBeTruthy();

    rerender(<ValveIndicator valve={valve({ health: 45 })} />);
    expect(document.querySelector(".bg-warning")).toBeTruthy();

    rerender(<ValveIndicator valve={valve({ health: 10 })} />);
    expect(document.querySelector(".bg-danger")).toBeTruthy();
  });

  it("renders the testing pulse only while status is 'testing'", () => {
    const { rerender } = render(<ValveIndicator valve={valve({ status: "inactive" })} />);
    expect(document.querySelector(".pulse-ring")).toBeNull();

    rerender(<ValveIndicator valve={valve({ status: "testing" })} />);
    expect(document.querySelector(".pulse-ring")).toBeTruthy();
  });
});
