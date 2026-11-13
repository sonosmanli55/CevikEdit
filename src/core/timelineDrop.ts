import type { MediaAsset, Track } from "./types";

export type DropKind = "video" | "audio" | "image" | "text";
/** Lanes that media can land on. */
export type LaneKind = "video" | "audio" | "text";

/**
 * A lane only takes the same kind, except that still images live on video
 * tracks. Text clips are not media assets, so the text kind exists only to keep
 * the routing table honest.
 */
export function trackAcceptsKind(track: Track, kind: DropKind): boolean {
  if (kind === "text") return track.kind === "text";
  if (kind === "image") return track.kind === "video";
  return track.kind === kind;
}

/** The lane kind a media asset belongs to. */
export function laneKindForAsset(asset: Pick<MediaAsset, "kind">): LaneKind {
  return asset.kind === "audio" ? "audio" : "video";
}

/**
 * Picks the lane a dropped asset should land on.
 *
 * Users should be able to drop media anywhere over the timeline: a video
 * dragged onto the audio lane still belongs on a video lane. The hovered lane
 * is only a hint — we honour it when it accepts the kind, otherwise we take the
 * nearest compatible unlocked lane, so vertical position still feels respected.
 */
export function resolveDropTrack(
  tracks: Track[],
  kind: DropKind,
  preferredTrackId?: string,
): Track | undefined {
  const usable = tracks.filter(
    (track) => !track.locked && trackAcceptsKind(track, kind),
  );
  if (!usable.length) return undefined;
  if (!preferredTrackId) return usable[0];
  const preferred = usable.find((track) => track.id === preferredTrackId);
  if (preferred) return preferred;
  const hovered = tracks.findIndex((track) => track.id === preferredTrackId);
  if (hovered < 0) return usable[0];
  // Closest compatible lane in track order; the one above wins ties.
  return usable
    .map((track) => ({
      track,
      distance: Math.abs(
        tracks.findIndex((entry) => entry.id === track.id) - hovered,
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0].track;
}

/** Keeps library order while grouping a mixed selection by destination lane. */
export function groupAssetsByLane(
  assets: MediaAsset[],
): { lane: LaneKind; assets: MediaAsset[] }[] {
  const order: LaneKind[] = [];
  const buckets = new Map<LaneKind, MediaAsset[]>();
  for (const asset of assets) {
    const lane = laneKindForAsset(asset);
    const bucket = buckets.get(lane);
    if (bucket) bucket.push(asset);
    else {
      buckets.set(lane, [asset]);
      order.push(lane);
    }
  }
  return order.map((lane) => ({ lane, assets: buckets.get(lane)! }));
}

/** True when every asset already fits the hovered lane. */
export function laneFitsAll(assets: MediaAsset[], track: Track): boolean {
  return assets.every((asset) =>
    trackAcceptsKind(
      track,
      asset.kind === "image" ? "image" : asset.kind === "audio" ? "audio" : "video",
    ),
  );
}
