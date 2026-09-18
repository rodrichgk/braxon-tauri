import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfileEditor from "./ProfileEditor";
import type { ProfilePoint, ServerProfile } from "@/hooks/useProfileManagement";

// Leaf: the Test Profile Editor. jsdom's canvas.getContext returns null, so
// stub a minimal 2D context to exercise the drawing effect, plus test the
// button wiring and the save-name gate.

type Props = Parameters<typeof ProfileEditor>[0];

function fakeCtx() {
  const ctx = {
    scale: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    arc: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
    strokeStyle: "", fillStyle: "", lineWidth: 0, font: "", textAlign: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  return ctx;
}

const profile = (id: string, name: string): ServerProfile => ({
  id, name, points: "[]", isDefault: false, createdAt: "", updatedAt: "",
});

const line: ProfilePoint[] = [
  { time: 0, frequency: 0 },
  { time: 7.5, frequency: 500 },
  { time: 15, frequency: 1000 },
];

const base = (over: Partial<Props> = {}): Props => ({
  profiles: [profile("p1", "Highway"), profile("p2", "City")],
  activeProfile: line,
  selectedProfileId: "p1",
  isLoadingProfiles: false,
  editingPoint: null,
  maxFrequency: 1500,
  onLoadProfile: vi.fn(),
  onSaveProfile: vi.fn(),
  onAddPoint: vi.fn(),
  onRemovePoint: vi.fn(),
  onCanvasClick: vi.fn(),
  ...over,
});

describe("<ProfileEditor>", () => {
  it("draws the profile line and points to the 2D context", () => {
    const ctx = fakeCtx();
    render(<ProfileEditor {...base()} />);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    // One arc per profile point.
    expect(ctx.arc).toHaveBeenCalledTimes(line.length);
  });

  it("seeds the save name from the selected profile and loads on select", async () => {
    const onLoadProfile = vi.fn();
    fakeCtx();
    render(<ProfileEditor {...base({ selectedProfileId: "p2", onLoadProfile })} />);
    // The name <input> is seeded from the selected profile. (The <select> also
    // shows "City" as its option, so scope to the textbox, not getByDisplayValue.)
    expect(screen.getByPlaceholderText(/profile name/i)).toHaveValue("City");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p1" } });
    expect(onLoadProfile).toHaveBeenCalledWith("p1");
  });

  it("gates Save on a non-empty name and trims it", async () => {
    const onSaveProfile = vi.fn();
    fakeCtx();
    render(
      <ProfileEditor {...base({ selectedProfileId: null, onSaveProfile })} />,
    );
    const save = screen.getByRole("button", { name: /^save$/i });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/profile name/i), "  Rally  ");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSaveProfile).toHaveBeenCalledWith("Rally");
  });

  it("wires Add Point, Remove Point and canvas clicks", async () => {
    const onAddPoint = vi.fn();
    const onRemovePoint = vi.fn();
    const onCanvasClick = vi.fn();
    fakeCtx();
    const { rerender } = render(
      <ProfileEditor {...base({ onAddPoint, onRemovePoint, onCanvasClick })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add point/i }));
    expect(onAddPoint).toHaveBeenCalledOnce();

    // editingPoint === null -> Remove is disabled.
    expect(screen.getByRole("button", { name: /remove/i })).toBeDisabled();
    rerender(
      <ProfileEditor
        {...base({ editingPoint: 1, onAddPoint, onRemovePoint, onCanvasClick })}
      />,
    );
    const remove = screen.getByRole("button", { name: /remove/i });
    expect(remove).toBeEnabled();
    await userEvent.click(remove);
    expect(onRemovePoint).toHaveBeenCalledOnce();

    fireEvent.click(document.querySelector("canvas")!);
    expect(onCanvasClick).toHaveBeenCalled();
  });

  it("shows a loading option while profiles are still loading", () => {
    fakeCtx();
    render(<ProfileEditor {...base({ isLoadingProfiles: true })} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
  });
});
