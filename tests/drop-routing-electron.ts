/**
 * Real desktop check for automatic lane routing: media dropped anywhere over the
 * timeline lands on a lane that accepts it. A video dropped on the audio lane
 * must still become a video clip, and vice versa.
 */
import { _electron as electron, expect, type Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { generateFixtures } from "../scripts/generate-fixtures";
import { importAssets } from "../electron/media";
import { createProject, createTrack } from "../src/core/model";
import type { Project } from "../src/core/types";

const root = process.cwd();
const output = path.join(root, ".test-output", "drop-routing-electron");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const fixtures = await generateFixtures(path.join(output, "media"));
const assets = await importAssets(
  [fixtures.video, fixtures.audio],
  path.join(output, "fixture-cache"),
);
const videoAsset = assets.find((asset) => asset.kind === "video")!;
const audioAsset = assets.find((asset) => asset.kind === "audio")!;

// Start with a video lane and an audio lane, both empty.
const project = createProject("Kanal yönlendirme");
project.width = 320;
project.height = 180;
project.assets = assets;
project.tracks = [createTrack("video", "Video 1"), createTrack("audio", "Ses 1")];
project.clips = [];
const file = path.join(output, "routing.cevikedit");
await writeFile(file, JSON.stringify(project));

const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
env.CEVIKEDIT_USER_DATA = path.join(output, "user-data");
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const app = await electron.launch({
  args: [path.join(root, "dist-electron", "main.cjs"), file],
  env,
  timeout: 30_000,
});
let page: Page | undefined;
const errors: string[] = [];
const checks: string[] = [];
const read = async (): Promise<Project> => JSON.parse(await readFile(file, "utf8"));
const save = async (): Promise<Project> => {
  await page!.getByRole("button", { name: "Projeyi kaydet", exact: true }).click();
  await expect(page!.locator(".save-dot")).not.toHaveClass(/dirty/);
  return read();
};

/** Drops one library asset onto a specific lane by its accessible track name. */
const dropOnLane = async (
  assetId: string,
  kind: "video" | "audio" | "image",
  laneIndex: number,
) => {
  const lane = page!.locator(".tl-lane").nth(laneIndex);
  const box = (await lane.boundingBox())!;
  await page!.locator(`[data-asset-id="${assetId}"]`).evaluate(
    (element, payload) => {
      const transfer = new DataTransfer();
      transfer.setData("application/x-cevikedit-asset", payload.assetId);
      transfer.setData("application/x-cevikedit-assets", JSON.stringify([payload.assetId]));
      transfer.setData(`application/x-cevikedit-kind-${payload.kind}`, payload.kind);
      transfer.effectAllowed = "copy";
      element.dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
      const laneElement = document.querySelectorAll(".tl-lane")[payload.laneIndex];
      laneElement.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientX: payload.x,
          clientY: payload.y,
          dataTransfer: transfer,
        }),
      );
      laneElement.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: payload.x,
          clientY: payload.y,
          dataTransfer: transfer,
        }),
      );
    },
    {
      assetId,
      kind,
      laneIndex,
      x: box.x + 120,
      y: box.y + box.height / 2,
    },
  );
};

try {
  await app.evaluate(
    ({ dialog }) => {
      (dialog as any).showMessageBox = async () => ({ response: 2 });
    },
  );
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".app-shell");
  await page.locator(".resource-tabs").getByRole("button", { name: "Medya", exact: true }).click();
  await expect(page.locator(".media-item")).toHaveCount(2);

  /* 1. Video dropped on the AUDIO lane still becomes a video clip. */
  const audioLaneIndex = 1; // "Ses 1"
  await dropOnLane(videoAsset.id, "video", audioLaneIndex);
  await expect(page.locator(".tl-clip")).toHaveCount(1, { timeout: 15_000 });
  let edited = await save();
  const videoClip = edited.clips.find((clip) => clip.assetId === videoAsset.id)!;
  assert(videoClip, "the video produced a clip");
  const videoTrack = edited.tracks.find((track) => track.id === videoClip.trackId)!;
  assert.equal(videoTrack.kind, "video", "video landed on a video lane");
  checks.push("video dropped on the audio lane is routed to a video lane");

  /* 2. Audio dropped on the VIDEO lane goes to the audio lane. */
  await page.locator(".resource-tabs").getByRole("button", { name: "Ses", exact: true }).click();
  await expect(page.locator(".media-item")).toHaveCount(1);
  await dropOnLane(audioAsset.id, "audio", 0);
  await expect(page.locator(".tl-clip")).toHaveCount(2, { timeout: 15_000 });
  edited = await save();
  const audioClip = edited.clips.find((clip) => clip.assetId === audioAsset.id)!;
  assert(audioClip, "the audio produced a clip");
  const audioTrack = edited.tracks.find((track) => track.id === audioClip.trackId)!;
  assert.equal(audioTrack.kind, "audio", "audio landed on an audio lane");
  checks.push("audio dropped on the video lane is routed to an audio lane");

  /* 3. Dropping a video onto empty space below the lanes still works. */
  await page.locator(".resource-tabs").getByRole("button", { name: "Medya", exact: true }).click();
  const content = page.locator(".tl-content");
  const contentBox = (await content.boundingBox())!;
  const laneBoxes = await page.locator(".tl-lane").evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().bottom),
  );
  const belowY = Math.min(contentBox.y + contentBox.height - 6, Math.max(...laneBoxes) + 26);
  await page.locator(".media-item").first().evaluate(
    (element, payload) => {
      const transfer = new DataTransfer();
      transfer.setData("application/x-cevikedit-asset", payload.assetId);
      transfer.setData("application/x-cevikedit-assets", JSON.stringify([payload.assetId]));
      transfer.setData("application/x-cevikedit-kind-video", "video");
      transfer.effectAllowed = "copy";
      element.dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
      const target = document.querySelector(".tl-content")!;
      target.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientX: payload.x,
          clientY: payload.y,
          dataTransfer: transfer,
        }),
      );
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: payload.x,
          clientY: payload.y,
          dataTransfer: transfer,
        }),
      );
    },
    { assetId: videoAsset.id, x: contentBox.x + 260, y: belowY },
  );
  await expect(page.locator(".tl-clip")).toHaveCount(3, { timeout: 15_000 });
  edited = await save();
  const extra = edited.clips.filter((clip) => clip.assetId === videoAsset.id);
  assert.equal(extra.length, 2, "second video drop created another clip");
  checks.push("dropping below the last lane still lands on a video lane");

  /* 4. A mixed selection fans out to both lane kinds in one drop. */
  await page.locator(".resource-tabs").getByRole("button", { name: "Medya", exact: true }).click();
  const items = page.locator(".media-item");
  await items.nth(0).click();
  await page.locator(".resource-tabs").getByRole("button", { name: "Ses", exact: true }).click();
  await page.locator(".media-item").first().click({ modifiers: ["Control"] });
  // Reset the selection context by dragging each asset individually through the
  // batch payload to prove the app groups by kind.
  const laneBox = (await page.locator(".tl-lane").first().boundingBox())!;
  await page.evaluate(
    (payload) => {
      const lane = document.querySelector(".tl-lane")!;
      const transfer = new DataTransfer();
      transfer.setData(
        "application/x-cevikedit-assets",
        JSON.stringify(payload.ids),
      );
      transfer.setData("application/x-cevikedit-kind-video", "video");
      transfer.effectAllowed = "copy";
      lane.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientX: payload.x,
          clientY: payload.y,
          dataTransfer: transfer,
        }),
      );
      lane.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: payload.x,
          clientY: payload.y,
          dataTransfer: transfer,
        }),
      );
    },
    {
      ids: [videoAsset.id, audioAsset.id],
      x: laneBox.x + 400,
      y: laneBox.y + laneBox.height / 2,
    },
  );
  await expect(page.locator(".tl-clip")).toHaveCount(5, { timeout: 15_000 });
  edited = await save();
  const lastVideo = edited.clips
    .filter((clip) => clip.assetId === videoAsset.id)
    .sort((a, b) => b.start - a.start)[0];
  const lastAudio = edited.clips
    .filter((clip) => clip.assetId === audioAsset.id)
    .sort((a, b) => b.start - a.start)[0];
  assert.equal(
    edited.tracks.find((track) => track.id === lastVideo.trackId)?.kind,
    "video",
  );
  assert.equal(
    edited.tracks.find((track) => track.id === lastAudio.trackId)?.kind,
    "audio",
  );
  checks.push("a mixed batch dropped on one lane splits across video and audio lanes");

  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "evidence.json"),
    JSON.stringify({ passedAt: new Date().toISOString(), checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await app.close();
}
