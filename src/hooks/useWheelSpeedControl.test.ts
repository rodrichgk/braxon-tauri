import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWheelSpeedControl } from "@/hooks/useWheelSpeedControl";

const setup = (isConnected = true) => {
  const sendMessage = vi.fn();
  const hook = renderHook(({ conn }) => useWheelSpeedControl({ isConnected: conn, sendMessage }), {
    initialProps: { conn: isConnected },
  });
  return { ...hook, sendMessage };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useWheelSpeedControl", () => {
  it("defaults to 0 km/h, all wheels enabled, linked", () => {
    const { result } = setup();
    expect(result.current.wheelSpeeds).toEqual({ fl: 0, fr: 0, rl: 0, rr: 0 });
    expect(result.current.wheelEnabled).toEqual({ fl: true, fr: true, rl: true, rr: true });
    expect(result.current.isLinked).toBe(true);
  });

  it("a linked master-speed change drives every enabled wheel and RAF-sends once", async () => {
    const { result, sendMessage } = setup();
    await act(async () => {
      result.current.handleMasterSpeedChange(80);
      await vi.runAllTimersAsync();
    });
    expect(result.current.wheelSpeeds).toEqual({ fl: 80, fr: 80, rl: 80, rr: 80 });
    expect(sendMessage).toHaveBeenCalledWith({ fl: 80, fr: 80, rl: 80, rr: 80 });
  });

  it("a disabled wheel stays at 0 while linked", () => {
    const { result } = setup();
    act(() => result.current.toggleWheelEnabled("rr")); // now disabled
    act(() => result.current.handleMasterSpeedChange(60));
    expect(result.current.wheelSpeeds).toEqual({ fl: 60, fr: 60, rl: 60, rr: 0 });
  });

  it("does not send when the transport is disconnected", async () => {
    const { result, sendMessage } = setup(false);
    await act(async () => {
      result.current.handleMasterSpeedChange(50);
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("de-dupes: the same speed set is not sent twice in a row", async () => {
    const { result, sendMessage } = setup();
    await act(async () => {
      result.current.handleMasterSpeedChange(50);
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.handleMasterSpeedChange(50); // identical -> deduped
      await vi.runAllTimersAsync();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("toggleLinked flips the link flag", () => {
    const { result } = setup();
    act(() => result.current.toggleLinked());
    expect(result.current.isLinked).toBe(false);
    act(() => result.current.toggleLinked());
    expect(result.current.isLinked).toBe(true);
  });

  it("individual wheel changes only apply while unlinked", () => {
    const { result } = setup();
    act(() => result.current.handleIndividualWheelChange("fr", 40));
    expect(result.current.wheelSpeeds.fr).toBe(0); // ignored while linked

    act(() => result.current.toggleLinked());
    act(() => result.current.handleIndividualWheelChange("fr", 40));
    expect(result.current.wheelSpeeds.fr).toBe(40);
  });
});
