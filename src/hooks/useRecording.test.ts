import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecording } from "@/hooks/useRecording";

const KEY = "wss_hil_profiles";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useRecording", () => {
  it("startRecording clears any previous capture and arms it", () => {
    const { result } = renderHook(() => useRecording());
    act(() => result.current.startRecording());
    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordedProfile).toEqual([]);
  });

  it("the first point seeds (0,0); subsequent points record time + frequency and skip repeats", () => {
    const { result } = renderHook(() => useRecording());
    act(() => result.current.startRecording());
    act(() => result.current.addRecordingPoint(100)); // first call -> seed [{0,0}]
    expect(result.current.recordedProfile).toEqual([{ time: 0, frequency: 0 }]);

    vi.advanceTimersByTime(2000);
    act(() => result.current.addRecordingPoint(200));
    act(() => result.current.addRecordingPoint(200)); // same freq -> ignored
    expect(result.current.recordedProfile).toEqual([
      { time: 0, frequency: 0 },
      { time: 2, frequency: 200 },
    ]);
  });

  it("addRecordingPoint is a no-op when not recording", () => {
    const { result } = renderHook(() => useRecording());
    act(() => result.current.addRecordingPoint(50));
    expect(result.current.recordedProfile).toEqual([]);
  });

  it("stopRecording appends a final point and disarms", () => {
    const { result } = renderHook(() => useRecording());
    act(() => result.current.startRecording());
    act(() => result.current.addRecordingPoint(100)); // seed
    vi.advanceTimersByTime(1000);
    act(() => result.current.addRecordingPoint(300));
    act(() => result.current.stopRecording(0));
    expect(result.current.isRecording).toBe(false);
    const prof = result.current.recordedProfile;
    expect(prof[prof.length - 1]).toEqual({ time: 1, frequency: 0 });
  });

  it("saveRecordedProfile needs >=2 points and a name, then writes to localStorage", async () => {
    const { result } = renderHook(() => useRecording());
    act(() => result.current.startRecording());
    act(() => result.current.addRecordingPoint(100));
    vi.advanceTimersByTime(500);
    act(() => result.current.addRecordingPoint(400));

    await act(async () => {
      await result.current.saveRecordedProfile("   "); // blank name -> rejected
    });
    expect(localStorage.getItem(KEY)).toBeNull();

    await act(async () => {
      await result.current.saveRecordedProfile("Highway");
    });
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "Highway", isDefault: false });
    expect(JSON.parse(saved[0].points)).toHaveLength(2);
  });

  it("clearRecording resets the buffer", () => {
    const { result } = renderHook(() => useRecording());
    act(() => result.current.startRecording());
    act(() => result.current.addRecordingPoint(100));
    act(() => result.current.clearRecording());
    expect(result.current.recordedProfile).toEqual([]);
  });
});
