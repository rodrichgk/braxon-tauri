import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("ThemeContext", () => {
  it("defaults to dark and adds the .dark class", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggle() flips the theme, the class and the stored value", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("braxon-theme")).toBe("light");
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
  });

  it("reads a previously stored preference", () => {
    localStorage.setItem("braxon-theme", "light");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("migrates the legacy pic-abs-theme key once", () => {
    localStorage.setItem("pic-abs-theme", "light");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem("braxon-theme")).toBe("light");
    expect(localStorage.getItem("pic-abs-theme")).toBeNull(); // removed after migration
  });
});
