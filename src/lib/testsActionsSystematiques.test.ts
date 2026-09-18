import { describe, it, expect } from "vitest";
import {
  TEST_ACTION_SECTIONS,
  TEST_ACTION_SECTION_LABELS,
  type TestActionSection,
} from "@/lib/testsActionsSystematiques";

const sectionKeys = Object.keys(TEST_ACTION_SECTIONS) as TestActionSection[];
const allItems = sectionKeys.flatMap((k) => TEST_ACTION_SECTIONS[k]);

describe("TEST_ACTION_SECTIONS catalog", () => {
  it("has a matching label for every section and vice-versa", () => {
    expect(Object.keys(TEST_ACTION_SECTION_LABELS).sort()).toEqual([...sectionKeys].sort());
  });

  it("every item has a 3-digit code, a non-empty label and a valid type", () => {
    for (const item of allItems) {
      expect(item.code).toMatch(/^\d{3}$/);
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(item.type);
    }
  });

  it("noIntParamTest is a positive integer or null", () => {
    for (const item of allItems) {
      if (item.noIntParamTest !== null) {
        expect(Number.isInteger(item.noIntParamTest)).toBe(true);
        expect(item.noIntParamTest).toBeGreaterThan(0);
      }
    }
  });

  it("every non-null noIntParamTest is unique — a shared id would write the wrong 4D row", () => {
    const ids = allItems.map((i) => i.noIntParamTest).filter((v): v is number => v !== null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the ABS section carries the pump / hydraulic / calculator checks", () => {
    const codes = TEST_ACTION_SECTIONS.ABS.map((i) => i.label);
    expect(codes).toContain("Test du moteur - pompe");
    expect(codes).toContain("Test hydraulique - électrovannes");
    // code 039 is a known, still-unverified gap
    expect(TEST_ACTION_SECTIONS.ABS.find((i) => i.code === "039")?.noIntParamTest).toBeNull();
  });

  it("GENERAL is shared and not empty", () => {
    expect(TEST_ACTION_SECTIONS.GENERAL.length).toBeGreaterThan(0);
    expect(TEST_ACTION_SECTIONS.GENERAL.every((i) => i.noIntParamTest !== null)).toBe(true);
  });
});
