import { describe, it, expect } from "vitest";
import { BUILTIN_ACTUATORS, BUILTIN_ACTUATORS_BY_REF, builtinActuatorsFor } from "@/lib/builtinActuators";

describe("builtinActuatorsFor", () => {
  it("returns the MK61 pump run/stop pair", () => {
    const acts = builtinActuatorsFor("MK61");
    expect(acts.map((a) => a.id)).toEqual(["mk61-pump-run", "mk61-pump-stop"]);
    expect(acts.find((a) => a.id === "mk61-pump-run")?.sentBytes).toBe("300100FFBF");
    expect(acts.find((a) => a.id === "mk61-pump-stop")?.sentBytes).toBe("300100FFFF");
  });

  it("returns [] for an unknown / null / undefined family with no ref match either", () => {
    expect(builtinActuatorsFor("MK70")).toEqual([]);
    expect(builtinActuatorsFor(null)).toEqual([]);
    expect(builtinActuatorsFor(undefined)).toEqual([]);
    expect(builtinActuatorsFor("")).toEqual([]);
  });

  it("falls back to the per-reference table when the family is unrecognised", () => {
    // 476601KD2A doesn't match any guessHardwareFamily shape and has no
    // DDT4ALL ecu_file link — the per-ref table is the only way its pump /
    // bleed tests can show up at all.
    const acts = builtinActuatorsFor(null, '476601KD2A');
    expect(acts.map((a) => a.id)).toEqual([
      '476601kd2a-pump-run', '476601kd2a-pump-stop',
      '476601kd2a-bleed-open', '476601kd2a-bleed-close', '476601kd2a-bleed-stop',
    ]);
    expect(acts.find((a) => a.id === '476601kd2a-pump-run')?.sentBytes).toBe('30060001');
    expect(acts.find((a) => a.id === '476601kd2a-bleed-open')?.sentBytes).toBe('30020002');
  });

  it("resolves the reference through punctuation, same as normalizeAbsRef elsewhere", () => {
    expect(builtinActuatorsFor(null, '4766.01-KD2.A').map((a) => a.id)).toEqual(
      BUILTIN_ACTUATORS_BY_REF['476601KD2A'].map((a) => a.id),
    );
  });

  it("merges family and per-reference tests rather than picking one", () => {
    const acts = builtinActuatorsFor("MK61", '476601KD2A');
    expect(acts.map((a) => a.id)).toEqual([
      'mk61-pump-run', 'mk61-pump-stop',
      '476601kd2a-pump-run', '476601kd2a-pump-stop',
      '476601kd2a-bleed-open', '476601kd2a-bleed-close', '476601kd2a-bleed-stop',
    ]);
  });

  it("returns just the family's tests when no reference is given", () => {
    expect(builtinActuatorsFor("MK61")).toEqual(builtinActuatorsFor("MK61", undefined));
  });

  it("returns the 10.0961-0315.3 pump routine (0x31 StartRoutineByLocalIdentifier, not MK61's 0x30)", () => {
    // Confirmed against BRAXON's own bus capture: both option pairs got a
    // positive `71 B8 …` back on the held 0x740→0x760 session.
    const acts = builtinActuatorsFor(null, '10.0961-0315.3');
    expect(acts.map((a) => a.id)).toEqual([
      '10096103153-pump-b8-0000', '10096103153-pump-b8-0102',
    ]);
    expect(acts.every((a) => a.category === 'pump')).toBe(true);
    expect(acts.find((a) => a.id === '10096103153-pump-b8-0000')?.sentBytes).toBe('31B80000');
    expect(acts.find((a) => a.id === '10096103153-pump-b8-0102')?.sentBytes).toBe('31B80102');
  });
});

describe("BUILTIN_ACTUATORS + BUILTIN_ACTUATORS_BY_REF catalog integrity", () => {
  const all = [...Object.values(BUILTIN_ACTUATORS).flat(), ...Object.values(BUILTIN_ACTUATORS_BY_REF).flat()];

  it("every entry has a unique id", () => {
    const ids = all.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sentBytes is an even-length uppercase hex string", () => {
    for (const a of all) {
      expect(a.sentBytes).toMatch(/^[0-9A-F]+$/);
      expect(a.sentBytes.length % 2).toBe(0);
    }
  });

  it("category is one of the allowed values", () => {
    const allowed = new Set(["pump", "valve", "relay", "calibration", "reset", "other"]);
    for (const a of all) expect(allowed.has(a.category)).toBe(true);
  });

  it("name and label are non-empty", () => {
    for (const a of all) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });
});
