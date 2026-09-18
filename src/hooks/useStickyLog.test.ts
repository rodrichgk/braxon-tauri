import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStickyLog } from "@/hooks/useStickyLog";

describe("useStickyLog", () => {
  it("starts empty and hidden", () => {
    const { result } = renderHook(() => useStickyLog());
    expect(result.current.lines).toEqual([]);
    expect(result.current.visible).toBe(false);
  });

  it("appends lines and clear() empties the buffer", () => {
    const { result } = renderHook(() => useStickyLog());
    act(() => result.current.add("a"));
    act(() => result.current.add("b"));
    expect(result.current.lines).toEqual(["a", "b"]);
    act(() => result.current.clear());
    expect(result.current.lines).toEqual([]);
  });

  it("keeps at most maxLines, dropping the oldest", () => {
    const { result } = renderHook(() => useStickyLog(3));
    act(() => {
      result.current.add("1");
      result.current.add("2");
      result.current.add("3");
      result.current.add("4");
    });
    expect(result.current.lines).toEqual(["2", "3", "4"]);
  });

  it("toggleVisible flips visibility", () => {
    const { result } = renderHook(() => useStickyLog());
    act(() => result.current.toggleVisible());
    expect(result.current.visible).toBe(true);
    act(() => result.current.toggleVisible());
    expect(result.current.visible).toBe(false);
  });
});
