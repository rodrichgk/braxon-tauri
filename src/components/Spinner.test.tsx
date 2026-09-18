import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Spinner, { LoadingRow } from "@/components/Spinner";

// Leaf presentational component — plain render, assert on the rendered
// element and the one prop it takes (className merge).

describe("<Spinner>", () => {
  it("renders a spinning, decorative icon with the default size classes", () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("animate-spin", "shrink-0", "w-3.5", "h-3.5");
    // Decorative: hidden from the accessibility tree.
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("merges a caller-supplied className in place of the default size", () => {
    const { container } = render(<Spinner className="w-8 h-8" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-8", "h-8", "animate-spin");
    expect(svg).not.toHaveClass("w-3.5");
  });
});

describe("<LoadingRow>", () => {
  it("shows the label next to a spinner", () => {
    const { container } = render(<LoadingRow label="Loading history…" />);
    expect(screen.getByText("Loading history…")).toBeInTheDocument();
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("applies the row and spinner className overrides", () => {
    const { container } = render(
      <LoadingRow label="Working" className="my-row" spinnerClassName="w-10 h-10" />,
    );
    expect(container.querySelector(".my-row")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveClass("w-10", "h-10");
  });
});
