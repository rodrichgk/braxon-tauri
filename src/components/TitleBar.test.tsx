import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TitleBar from "@/components/TitleBar";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

function Harness() {
  const { theme } = useTheme();
  return (
    <ThemeProvider>
      <div data-testid="theme">{theme}</div>
      <TitleBar />
    </ThemeProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("<TitleBar>", () => {
  it("renders the window controls and a theme toggle", () => {
    render(
      <ThemeProvider>
        <TitleBar />
      </ThemeProvider>,
    );
    // 1 theme toggle + 3 traffic lights
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /light mode/i })).toBeInTheDocument();
  });

  it("toggling flips the theme", async () => {
    render(
      <ThemeProvider>
        <TitleBar />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole("button", { name: /light mode/i });
    await userEvent.click(toggle);
    // now offering dark mode
    expect(screen.getByRole("button", { name: /dark mode/i })).toBeInTheDocument();
    expect(localStorage.getItem("braxon-theme")).toBe("light");
  });

  it("mounts without a crash inside a broader tree", () => {
    expect(() => render(<Harness />)).not.toThrow();
  });
});
