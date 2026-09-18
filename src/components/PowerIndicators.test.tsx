import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";

// The component overrides this with the `isConnected` prop in every test;
// stub the hook so its async mount effects don't remount the (locally-defined)
// PowerBtn subtree mid-click.
vi.mock("@/hooks/useClientSerialConnection", () => ({
  useClientSerialConnection: () => ({ isConnected: false }),
}));

import PowerIndicators, { type PowerIndicatorsRef } from "@/components/PowerIndicators";

describe("<PowerIndicators>", () => {
  it("disables the controls and shows a hint while disconnected", () => {
    render(<PowerIndicators sendMessage={vi.fn()} isConnected={false} />);
    expect(screen.getByText("Power Control")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ABS Power/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Ignition/i })).toBeDisabled();
    expect(screen.getByText(/connect an interface/i)).toBeInTheDocument();
  });

  it("toggles ABS power with a type-15 frame and reports the new state", async () => {
    const sendMessage = vi.fn().mockResolvedValue(true);
    const onPowerStatusChange = vi.fn();
    render(<PowerIndicators sendMessage={sendMessage} isConnected onPowerStatusChange={onPowerStatusChange} />);

    await userEvent.click(screen.getByRole("button", { name: /ABS Power/i }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const frame = JSON.parse(sendMessage.mock.calls[0][0] as string);
    expect(frame).toMatchObject({ type: 15, state: true });
    expect(onPowerStatusChange).toHaveBeenCalledWith(true, false);
    expect(await screen.findByRole("button", { name: /ABS Power · ON/i })).toBeInTheDocument();
  });

  it("does not flip state when the send fails", async () => {
    const sendMessage = vi.fn().mockResolvedValue(false);
    render(<PowerIndicators sendMessage={sendMessage} isConnected />);
    await userEvent.click(screen.getByRole("button", { name: /Ignition/i }));
    expect(screen.getByRole("button", { name: /Ignition · OFF/i })).toBeInTheDocument();
  });

  it("exposes an imperative toggle via ref", async () => {
    const sendMessage = vi.fn().mockResolvedValue(true);
    const ref = createRef<PowerIndicatorsRef>();
    render(<PowerIndicators ref={ref} sendMessage={sendMessage} isConnected />);
    await ref.current!.toggleIgnition();
    const frame = JSON.parse(sendMessage.mock.calls[0][0] as string);
    expect(frame.type).toBe(16);
  });
});
