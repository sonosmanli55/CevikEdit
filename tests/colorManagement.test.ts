import { describe, expect, it } from "vitest";
import {
  colorBadge,
  describeColor,
  hdrWarnings,
  outputColorArguments,
  tonemapFilters,
} from "../src/core/colorManagement";

describe("HDR detection and tone mapping", () => {
  it("classifies SDR, PQ and HLG from stream metadata", () => {
    expect(describeColor({}).kind).toBe("sdr");
    expect(
      describeColor({ colorTransfer: "bt709", colorPrimaries: "bt709" }),
    ).toMatchObject({ kind: "sdr", hdr: false, transfer: "bt709" });
    expect(
      describeColor({ colorTransfer: "smpte2084", colorPrimaries: "bt2020" }),
    ).toMatchObject({ kind: "pq", hdr: true, primaries: "bt2020" });
    expect(
      describeColor({ colorTransfer: "arib-std-b67", colorPrimaries: "bt2020" }),
    ).toMatchObject({ kind: "hlg", hdr: true });
    // A 10-bit bt2020 stream without transfer metadata is treated as HDR.
    expect(
      describeColor({ colorPrimaries: "bt2020", bitsPerRawSample: 10 }).kind,
    ).toBe("pq");
    // 8-bit bt2020 without transfer stays SDR (no fake tone mapping).
    expect(
      describeColor({ colorPrimaries: "bt2020", bitsPerRawSample: 8 }).kind,
    ).toBe("sdr");
  });
  it("builds no filters for SDR and a complete chain for HDR", () => {
    expect(tonemapFilters({ hdr: false, kind: "sdr" })).toEqual([]);
    const pq = tonemapFilters({ hdr: true, kind: "pq" });
    expect(pq).toContain("zscale=t=linear:npl=100");
    expect(pq).toContain("tonemap=tonemap=hable:desat=0");
    expect(pq).toContain("zscale=t=bt709:m=bt709:r=tv");
    expect(pq.at(-1)).toBe("format=rgba");
    expect(pq.some((filter) => filter.includes("arib-std-b67"))).toBe(false);
    const hlg = tonemapFilters({ hdr: true, kind: "hlg" });
    expect(hlg[0]).toContain("arib-std-b67");
    // Tone mapping happens before the final rgba conversion used by the graph.
    expect(hlg.indexOf("format=gbrpf32le")).toBeGreaterThan(0);
  });
  it("tags the output as BT.709 instead of leaving it unlabelled", () => {
    expect(outputColorArguments()).toEqual([
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
    ]);
  });
  it("shows a badge only for HDR and summarizes export behaviour", () => {
    expect(colorBadge({ hdr: false, kind: "sdr" })).toBeNull();
    expect(colorBadge({ hdr: true, kind: "pq" })).toBe("HDR");
    expect(colorBadge({ hdr: true, kind: "hlg" })).toBe("HLG");
    expect(hdrWarnings([])).toEqual([]);
    expect(
      hdrWarnings([
        { name: "a.mp4", info: { hdr: false, kind: "sdr" } },
      ]),
    ).toEqual([]);
    const warnings = hdrWarnings([
      { name: "a.mp4", info: { hdr: true, kind: "pq" } },
      { name: "b.mp4", info: { hdr: true, kind: "hlg" } },
      { name: "c.mp4", info: { hdr: true, kind: "pq" } },
      { name: "d.mp4", info: { hdr: true, kind: "pq" } },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("4 HDR kaynak");
    expect(warnings[0]).toContain("a.mp4, b.mp4, c.mp4");
    expect(warnings[0]).toContain("+1");
    expect(warnings[0]).toContain("BT.709");
  });
});
