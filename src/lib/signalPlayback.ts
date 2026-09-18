/* ── WSS signal recording playback ──────────────────────────────────────
   Turns a recorded (time, frequency) curve — e.g. an operator dragging the
   frequency slider through a 0→200→0 Hz accel/brake cycle — into a flat,
   absolute-time command schedule that loops for a fixed total test duration.

   A pause is inserted after every completed loop: on the bench, ramping the
   wheel-speed signal back down to a standstill is when the ABS ECU actually
   reacts (braking event), so the next cycle shouldn't start until that
   reaction has had time to happen. Kept as pure timing math — no
   React/Tauri — so it can be driven by any board (Pico signal board,
   legacy Nano) via plain `setTimeout`. */

export interface ProfilePoint {
  time: number;
  frequency: number;
}

export interface PlaybackSegment {
  /** Seconds from the start of playback when `frequency` should be sent. */
  atSeconds: number;
  frequency: number;
}

export interface PlaybackOptions {
  /** Total wall-clock length of the whole test, in seconds. */
  totalDurationSeconds: number;
  /** Pause after each completed loop before the next one starts, in
   *  seconds — the ABS reaction window. Default 4s. */
  loopPauseSeconds?: number;
}

/** Build the absolute-time frequency schedule for looping a recorded
 *  profile until `totalDurationSeconds` elapses, with `loopPauseSeconds`
 *  held between loops. Consecutive equal-frequency segments are collapsed
 *  (no point re-sending a value the board is already holding), and the
 *  schedule always resolves to 0 Hz by the end of the duration — even if
 *  cut off mid-ramp — so a test never leaves the bench spinning. */
export function buildPlaybackSchedule(
  profile: ProfilePoint[],
  options: PlaybackOptions,
): PlaybackSegment[] {
  const { totalDurationSeconds, loopPauseSeconds = 4 } = options;
  if (profile.length < 2 || totalDurationSeconds <= 0) return [];

  const sorted = [...profile].sort((a, b) => a.time - b.time);
  const baseTime = sorted[0].time;
  const cycleDuration = sorted[sorted.length - 1].time - baseTime;
  // A degenerate recording (every point at the same instant) can't be
  // looped — there's no curve to divide time into cycles by.
  if (cycleDuration <= 0) return [];

  const loopLength = cycleDuration + Math.max(loopPauseSeconds, 0);
  const segments: PlaybackSegment[] = [];

  const push = (atSeconds: number, frequency: number) => {
    const last = segments[segments.length - 1];
    if (last && last.frequency === frequency) return;
    segments.push({ atSeconds, frequency });
  };

  for (let loopStart = 0; loopStart < totalDurationSeconds; loopStart += loopLength) {
    for (const point of sorted) {
      const atSeconds = loopStart + (point.time - baseTime);
      if (atSeconds >= totalDurationSeconds) break;
      push(atSeconds, point.frequency);
    }
  }
  push(totalDurationSeconds, 0);

  return segments;
}
