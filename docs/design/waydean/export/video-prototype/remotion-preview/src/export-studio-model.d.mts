import type { VideoAspectRatio } from "./composition-config.mjs";

export type ExportSettings = {
  title: string;
  scopeType: "all" | "path" | "branch";
  selectedPersonId: string;
  includeDates: boolean;
  aspectRatio: VideoAspectRatio;
  backgroundId: string;
};

export declare const EXPORT_SETTINGS_STORAGE_KEY: string;
export declare const DEFAULT_EXPORT_SETTINGS: Readonly<ExportSettings>;
export declare function normalizeExportSettings(input?: Partial<ExportSettings>, people?: import("./project-model.mjs").PersonRecord[]): ExportSettings;
export declare function buildExportPreview(input?: Partial<ExportSettings>, people?: import("./project-model.mjs").PersonRecord[]): {
  settings: ExportSettings;
  story: import("./project-model.mjs").StoryModel;
  peopleCount: number;
  generationCount: number;
  sceneCount: number;
  durationFrames: number;
  durationSeconds: number;
  fps: number;
  frame: {
    width: number;
    height: number;
    aspectRatio: VideoAspectRatio;
    status: "review-candidate";
  };
};
