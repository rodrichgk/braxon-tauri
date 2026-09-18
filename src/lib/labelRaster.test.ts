import { describe, it, expect, vi, afterEach } from "vitest";
import { labelDots, LABEL_FONT, renderLabelCanvas, canvasToZplGfa } from "@/lib/labelRaster";
import { DEFAULT_LAYOUT, DPMM } from "@/lib/labelLayout";

// ── labelDots / LABEL_FONT — pure ──────────────────────────────────────────
describe("labelDots", () => {
  it("converts mm to dots at 8 dot/mm, flooring at 8", () => {
    expect(labelDots({ ...DEFAULT_LAYOUT, labelWmm: 50, labelHmm: 40 })).toEqual({
      w: 50 * DPMM,
      h: 40 * DPMM,
    });
    expect(labelDots({ ...DEFAULT_LAYOUT, labelWmm: 0, labelHmm: 0 })).toEqual({ w: 8, h: 8 });
  });

  it("rounds fractional mm", () => {
    expect(labelDots({ ...DEFAULT_LAYOUT, labelWmm: 10.06, labelHmm: 10.02 })).toEqual({ w: 80, h: 80 });
  });
});

describe("LABEL_FONT", () => {
  it("is a bold px Consolas stack", () => {
    expect(LABEL_FONT(54)).toBe('bold 54px Consolas, "Courier New", monospace');
  });
});

// ── a fake 2D canvas we control pixel-by-pixel ─────────────────────────────
type RGBA = [number, number, number, number];
function fakeCanvas(w: number, h: number, pixel: (x: number, y: number) => RGBA) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return {
    width: w,
    height: h,
    getContext: () => ({ getImageData: () => ({ data }) }),
  } as unknown as HTMLCanvasElement;
}

const WHITE: RGBA = [255, 255, 255, 255];
const BLACK: RGBA = [0, 0, 0, 255];

describe("canvasToZplGfa", () => {
  it("emits the ^GFA header with byte counts and row stride", () => {
    const gfa = canvasToZplGfa(fakeCanvas(16, 4, () => WHITE));
    // rowBytes = ceil(16/8) = 2 ; total = 2 * 4 = 8
    expect(gfa.startsWith("^GFA,8,8,2,")).toBe(true);
  });

  it("packs a set pixel into the MSB-first bit of its byte", () => {
    // one black pixel at x=0, 8 wide, 1 tall -> byte 0x80
    const gfa = canvasToZplGfa(fakeCanvas(8, 1, (x) => (x === 0 ? BLACK : WHITE)));
    expect(gfa).toBe("^GFA,1,1,1,80");
  });

  it("uses ',' to white-fill the rest of a row and ':' to repeat a row", () => {
    const gfa = canvasToZplGfa(fakeCanvas(8, 3, () => WHITE));
    // row0 -> "" + "," ; row1,row2 identical -> ":" each
    expect(gfa).toBe("^GFA,3,3,1,,::");
  });

  it("thresholds on luminance and treats transparent pixels as white", () => {
    // mid-grey 200 -> white (lum 200) ; grey 100 -> black ; transparent -> white
    const light = canvasToZplGfa(fakeCanvas(8, 1, () => [200, 200, 200, 255]));
    expect(light).toBe("^GFA,1,1,1,,");
    const dark = canvasToZplGfa(fakeCanvas(8, 1, (x) => (x === 0 ? [100, 100, 100, 255] : WHITE)));
    expect(dark).toBe("^GFA,1,1,1,80");
    const clear = canvasToZplGfa(fakeCanvas(8, 1, () => [0, 0, 0, 0]));
    expect(clear).toBe("^GFA,1,1,1,,");
  });
});

// ── renderLabelCanvas — with a recording 2D context ────────────────────────
afterEach(() => vi.restoreAllMocks());

function recordingCtx() {
  return {
    fillStyle: "",
    font: "",
    textBaseline: "" as CanvasTextBaseline,
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };
}

describe("renderLabelCanvas", () => {
  it("paints a white ground, the job number, and the QR modules", () => {
    const ctx = recordingCtx();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);

    const layout = { ...DEFAULT_LAYOUT };
    const canvas = renderLabelCanvas(layout, "17500101", "https://x/s/pc1/job/17500101");

    expect(canvas.width).toBe(layout.labelWmm * DPMM);
    expect(canvas.height).toBe(layout.labelHmm * DPMM);
    // white background rect over the whole label
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    // job number at the configured cell origin, with the configured font
    expect(ctx.font).toBe(LABEL_FONT(layout.numberFont));
    expect(ctx.fillText).toHaveBeenCalledWith("17500101", layout.numberX, layout.numberY);
    // QR draws many module rects (1 bg fillRect + N module rects)
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThan(50);
  });

  it("leaves the QR area blank when QR creation fails, without throwing", () => {
    const ctx = recordingCtx();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    // An empty string still encodes; force a failure with a value QRCode rejects.
    expect(() => renderLabelCanvas({ ...DEFAULT_LAYOUT }, "J", "\uD800")).not.toThrow();
    expect(ctx.fillText).toHaveBeenCalled(); // number still drawn
  });
});
