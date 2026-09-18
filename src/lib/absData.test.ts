import { describe, it, expect, vi, beforeEach } from "vitest";
import { muteConsole } from "@/test/tauri";

vi.mock("@/lib/api", () => ({
  fetchABSData: vi.fn(),
  searchABSData: vi.fn(),
  createABSData: vi.fn(),
  updateABSData: vi.fn(),
  deleteABSData: vi.fn(),
}));

import * as api from "@/lib/api";
import {
  fetchABSData,
  searchABSData,
  updateABSDataItem,
  addABSDataItem,
  deleteABSDataItem,
  type ABSDataItem,
} from "@/lib/absData";

const item = (over: Partial<ABSDataItem> = {}): ABSDataItem => ({
  partNumber: "10.0961-1464.3",
  manufacturer: "ATE",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("fetchABSData", () => {
  it("passes the API result through", async () => {
    vi.mocked(api.fetchABSData).mockResolvedValue([item()]);
    expect(await fetchABSData()).toEqual([item()]);
  });

  it("swallows an API error and returns []", async () => {
    const spies = muteConsole();
    vi.mocked(api.fetchABSData).mockRejectedValue(new Error("offline"));
    expect(await fetchABSData()).toEqual([]);
    expect(spies.error).toHaveBeenCalled();
  });
});

describe("searchABSData", () => {
  it("forwards the query and returns [] on error", async () => {
    muteConsole();
    vi.mocked(api.searchABSData).mockResolvedValue([item({ partNumber: "X" })]);
    expect(await searchABSData("mk61")).toEqual([item({ partNumber: "X" })]);
    expect(api.searchABSData).toHaveBeenCalledWith("mk61");

    vi.mocked(api.searchABSData).mockRejectedValue(new Error("boom"));
    expect(await searchABSData("mk61")).toEqual([]);
  });
});

describe("updateABSDataItem", () => {
  it("requires an id", async () => {
    await expect(updateABSDataItem(item())).rejects.toThrow(/ID is required/);
    expect(api.updateABSData).not.toHaveBeenCalled();
  });

  it("calls the API with id + item when present", async () => {
    const withId = item({ id: "row7" });
    await updateABSDataItem(withId);
    expect(api.updateABSData).toHaveBeenCalledWith("row7", withId);
  });
});

describe("add / delete", () => {
  it("delegate straight to the API", async () => {
    await addABSDataItem(item());
    expect(api.createABSData).toHaveBeenCalledWith(item());
    await deleteABSDataItem("row9");
    expect(api.deleteABSData).toHaveBeenCalledWith("row9");
  });
});
