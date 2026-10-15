export declare const REMOTION_COMPOSITION: Readonly<{
  id: string;
  width: number;
  height: number;
  fps: number;
}>;

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";

export declare const DEFAULT_VIDEO_ASPECT_RATIO: VideoAspectRatio;
export declare const VIDEO_FORMATS: Readonly<Record<VideoAspectRatio, Readonly<{
  label: string;
  width: number;
  height: number;
}>>>;
export declare function getVideoFormat(aspectRatio?: string): Readonly<{
  label: string;
  width: number;
  height: number;
}>;

export declare const DEFAULT_FAMILY_HISTORY_PROPS: Readonly<{
  title: string;
  scopeType: "all";
  selectedPersonId: string;
  includeDates: boolean;
  aspectRatio: VideoAspectRatio;
}>;
