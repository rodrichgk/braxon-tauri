import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordingControls from "./RecordingControls";
import type { ProfilePoint } from "@/hooks/useProfileManagement";

// Leaf: prop-driven Recording Studio panel. Cover the record/stop toggle,
// the disabled rules, and the save-name gate.

type Props = Parameters<typeof RecordingControls>[0];

const pts = (n: number): ProfilePoint[] =>
  Array.from({ length: n }, (_, i) => ({ time: i, frequency: i * 100 }));

const base = (over: Partial<Props> = {}): Props => ({
  isRecording: false,
  isPlayingRecorded: false,
  recordedProfile: [],
  recordingStartTime: null,
  isConnected: true,
  isAutoTesting: false,
  profileEditorOpen: false,
  onStartRecording: vi.fn(),
  onStopRecording: vi.fn(),
  onPlayRecorded: vi.fn(),
  onStopPlayback: vi.fn(),
  onSaveRecorded: vi.fn(),
  ...over,
});

describe("<RecordingControls>", () => {
  it("starts recording when connected and idle", async () => {
    const onStartRecording = vi.fn();
    render(<RecordingControls {...base({ onStartRecording })} />);
    const btn = screen.getByRole("button", { name: /^record$/i });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onStartRecording).toHaveBeenCalledOnce();
  });

  it("shows the live indicator and stops recording", async () => {
    const onStopRecording = vi.fn();
    render(
      <RecordingControls
        {...base({ isRecording: true, recordingStartTime: Date.now(), onStopRecording })}
      />,
    );
    expect(screen.getByText(/recording…/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(onStopRecording).toHaveBeenCalledOnce();
  });

  it("disables Record while disconnected", () => {
    render(<RecordingControls {...base({ isConnected: false })} />);
    expect(screen.getByRole("button", { name: /^record$/i })).toBeDisabled();
  });

  it("only allows saving a non-empty name once a profile of >= 2 points exists", async () => {
    const onSaveRecorded = vi.fn();
    render(
      <RecordingControls {...base({ recordedProfile: pts(3), onSaveRecorded })} />,
    );
    const save = screen.getByRole("button", { name: /^save$/i });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/profile name/i), "  curve-A  ");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSaveRecorded).toHaveBeenCalledWith("curve-A");
  });

  it("shows the hint and no save row before anything is recorded", () => {
    render(<RecordingControls {...base({ recordedProfile: [] })} />);
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
    expect(
      screen.getByText(/click record then adjust the frequency slider/i),
    ).toBeInTheDocument();
  });

  it("hides the save row for a single-point recording", () => {
    render(<RecordingControls {...base({ recordedProfile: pts(1) })} />);
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
  });
});
