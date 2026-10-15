import type { StoryModel, StoryShot } from "./remotion-preview/src/project-model.mjs";

export type SceneThumbnailModel = {
  width: number;
  height: number;
  overview: boolean;
  nodes: Array<{ id: string; x: number; y: number; focus: boolean }>;
  edges: Array<{ key: string; parentId: string; childId: string; active: boolean }>;
};

export declare function buildSceneThumbnail(
  story: StoryModel,
  shot: StoryShot,
  options?: { width?: number; height?: number }
): SceneThumbnailModel;
