/**
 * Colour management for HDR sources.
 *
 * CevikEdit previews and exports SDR BT.709. A PQ/HLG source (HDR10, HLG) must be
 * tone mapped, otherwise it looks washed out and over-bright. Detection uses
 * the stream metadata FFprobe reports; the filter chain is generated here so the
 * same code can be unit tested, and the export applies it per layer.
 */
export type ColorTransfer = "sdr" | "pq" | "hlg";

export interface ColorInfo {
  /** `bt709`, `bt2020`, `smpte2084`… as reported by FFprobe. */
  primaries?: string;
  transfer?: string;
  /** True when the transfer function is PQ or HLG. */
  hdr: boolean;
  kind: ColorTransfer;
}

const PQ = new Set(["smpte2084", "smpte-st-2084", "pq"]);
const HLG = new Set(["arib-std-b67", "arib_std_b67", "hlg"]);

/** Interpret FFprobe `color_transfer`/`color_primaries`/pix_fmt into a decision. */
export function describeColor(input: {
  colorTransfer?: string;
  colorPrimaries?: string;
  pixFmt?: string;
  bitsPerRawSample?: number;
}): ColorInfo {
  const transfer = input.colorTransfer?.toLowerCase();
  const primaries = input.colorPrimaries?.toLowerCase();
  const bits = input.bitsPerRawSample ?? 0;
  const kind: ColorTransfer = transfer && PQ.has(transfer)
    ? "pq"
    : transfer && HLG.has(transfer)
      ? "hlg"
      : // A 10-bit bt2020 stream without an explicit transfer is treated as HDR:
        // guessing SDR would visibly crush the highlights.
        primaries === "bt2020" && bits >= 10
        ? "pq"
        : "sdr";
  return {
    ...(primaries ? { primaries } : {}),
    ...(transfer ? { transfer } : {}),
    hdr: kind !== "sdr",
    kind,
  };
}

/**
 * Filters that convert one HDR layer to SDR BT.709. `npl` is the nominal peak
 * luminance used by the tone mapper; 100 nits matches BT.709 white. HLG is
 * first expanded to PQ so a single tone map handles both.
 */
export function tonemapFilters(info: ColorInfo): string[] {
  if (!info.hdr) return [];
  const chain = [
    "zscale=t=linear:npl=100",
    "format=gbrpf32le",
    "zscale=p=bt709",
    "tonemap=tonemap=hable:desat=0",
    "zscale=t=bt709:m=bt709:r=tv",
    "format=rgba",
  ];
  if (info.kind === "hlg")
    chain.unshift("zscale=t=arib-std-b67:m=bt2020:r=tv");
  return chain;
}

/** Explicit BT.709 tags so players and editors do not guess. */
export function outputColorArguments(): string[] {
  return [
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
  ];
}

/** Turkish label for the media library badge. */
export function colorBadge(info: ColorInfo): string | null {
  if (!info.hdr) return null;
  return info.kind === "hlg" ? "HLG" : "HDR";
}

export interface ColorWarningInput {
  name: string;
  info: ColorInfo;
}

/**
 * Export-time note listing HDR sources. The project itself stays SDR, which is
 * stated instead of silently changing colours.
 */
export function hdrWarnings(assets: ColorWarningInput[]): string[] {
  const hdr = assets.filter((asset) => asset.info.hdr);
  if (!hdr.length) return [];
  const names = hdr.slice(0, 3).map((asset) => asset.name).join(", ");
  const more = hdr.length > 3 ? ` +${hdr.length - 3}` : "";
  return [
    `${hdr.length} HDR kaynak (${names}${more}) SDR BT.709'a ton eşlenir; proje SDR olarak kalır.`,
  ];
}
