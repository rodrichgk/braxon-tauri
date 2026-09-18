import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import QrCode from "@/components/QrCode";

describe("<QrCode>", () => {
  it("renders an inline SVG for a valid value at the requested size", async () => {
    const { container } = render(<QrCode value="https://x/s/pc1/job/17500101" size={160} />);
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy());
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.width).toBe("160px");
    expect(box.style.height).toBe("160px");
  });

  it("re-renders when the value changes", async () => {
    const { container, rerender } = render(<QrCode value="A" />);
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy());
    const first = container.querySelector("svg")!.outerHTML;
    rerender(<QrCode value="B-different-payload" />);
    await waitFor(() => expect(container.querySelector("svg")!.outerHTML).not.toBe(first));
  });

  it("shows a 'QR error' fallback when encoding fails", async () => {
    // qrcode rejects a value it cannot encode (too long for any version).
    const { getByText } = render(<QrCode value={"x".repeat(6000)} />);
    await waitFor(() => expect(getByText("QR error")).toBeInTheDocument());
  });
});
