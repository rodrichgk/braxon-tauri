import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PressureGauge from "@/components/PressureGauge";

// The big readout is `<text y="140">`; tick labels share the same digits, so
// scope value assertions to that element.
const readout = (c: HTMLElement) => c.querySelector('text[y="140"]')?.textContent ?? "";

describe("<PressureGauge>", () => {
  it("shows the rounded value with a Bar unit and the label", () => {
    const { container } = render(<PressureGauge label="Pump" value={123.6} />);
    expect(readout(container)).toBe("124Bar");
    expect(screen.getByText("Pump")).toBeInTheDocument();
  });

  it("clamps the reading to the 0–400 face", () => {
    const { container, rerender } = render(<PressureGauge label="C1" value={999} />);
    expect(readout(container)).toBe("400Bar");
    rerender(<PressureGauge label="C1" value={-50} />);
    expect(readout(container)).toBe("0Bar");
  });

  it("renders '—' and no Bar unit when there is no data", () => {
    const { container } = render(<PressureGauge label="C2" value={0} noData />);
    expect(readout(container)).toBe("—");
    expect(screen.queryByText("Bar")).toBeNull();
  });

  it("shows the ERROR tag when the board flagged the channel", () => {
    render(<PressureGauge label="C3" value={100} error />);
    expect(screen.getByText("ERROR")).toBeInTheDocument();
  });

  it("noData suppresses a board error (nothing behind it)", () => {
    render(<PressureGauge label="C4" value={0} error noData />);
    expect(screen.queryByText("ERROR")).toBeNull();
  });

  it("paints the danger arc once the reading is over the danger threshold", () => {
    const { container, rerender } = render(<PressureGauge label="C5" value={100} dangerThreshold={150} />);
    expect(container.querySelector(".text-danger.text-accent")).toBeNull();
    expect(container.querySelector("path.text-accent")).toBeTruthy();

    rerender(<PressureGauge label="C5" value={200} dangerThreshold={150} />);
    expect(container.querySelector("path.text-danger")).toBeTruthy();
  });

  it("shows the secondary reading only when asked", () => {
    const { rerender } = render(<PressureGauge label="C6" value={50} secondary={12} />);
    expect(screen.queryByText(/\| 12 Bar/)).toBeNull();
    rerender(<PressureGauge label="C6" value={50} secondary={12} showSecondary />);
    expect(screen.getByText(/\| 12 Bar/)).toBeInTheDocument();
  });
});
