import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WheelSpeedControls from "./WheelSpeedControls";

// Leaf / presentational: fully prop-driven, no context or IPC. Cover both
// layout modes (linked vs individual), the wiring of each callback, and the
// disabled rule.

type Props = Parameters<typeof WheelSpeedControls>[0];

const base = (over: Partial<Props> = {}): Props => ({
  wheelSpeeds: { fl: 10, fr: 20, rl: 30, rr: 40 },
  wheelEnabled: { fl: true, fr: true, rl: false, rr: true },
  isLinked: true,
  masterSpeed: 25,
  maxSpeed: 1500,
  isConnected: true,
  isAutoTesting: false,
  isPlayingRecorded: false,
  onMasterSpeedChange: vi.fn(),
  onIndividualWheelChange: vi.fn(),
  onToggleWheelEnabled: vi.fn(),
  onToggleLinked: vi.fn(),
  ...over,
});

describe("<WheelSpeedControls>", () => {
  it("linked mode shows the master override and one slider", () => {
    render(<WheelSpeedControls {...base({ isLinked: true, masterSpeed: 42 })} />);
    expect(screen.getByText("42 Hz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /linked/i })).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    // Per-wheel enable buttons reflect each wheel's state.
    expect(screen.getByRole("button", { name: /FL · 10 Hz/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RL · OFF/ })).toBeInTheDocument();
  });

  it("master slider change reports the parsed integer", () => {
    const onMasterSpeedChange = vi.fn();
    render(<WheelSpeedControls {...base({ onMasterSpeedChange })} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "300" } });
    expect(onMasterSpeedChange).toHaveBeenCalledWith(300);
  });

  it("toggling link + a wheel calls the right callbacks", async () => {
    const onToggleLinked = vi.fn();
    const onToggleWheelEnabled = vi.fn();
    render(
      <WheelSpeedControls {...base({ onToggleLinked, onToggleWheelEnabled })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /linked/i }));
    expect(onToggleLinked).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: /FR · 20 Hz/ }));
    expect(onToggleWheelEnabled).toHaveBeenCalledWith("fr");
  });

  it("individual mode renders one slider per wheel and reports the wheel key", () => {
    const onIndividualWheelChange = vi.fn();
    render(
      <WheelSpeedControls
        {...base({ isLinked: false, onIndividualWheelChange })}
      />,
    );
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(4);
    // First slider is FL (Object.entries iteration order of wheelSpeeds).
    fireEvent.change(sliders[0], { target: { value: "123" } });
    expect(onIndividualWheelChange).toHaveBeenCalledWith("fl", 123);
  });

  it("disables every control when not connected", () => {
    render(<WheelSpeedControls {...base({ isConnected: false })} />);
    expect(screen.getByRole("slider")).toBeDisabled();
    for (const b of screen.getAllByRole("button", { name: /Hz|OFF/ })) {
      expect(b).toBeDisabled();
    }
  });
});
