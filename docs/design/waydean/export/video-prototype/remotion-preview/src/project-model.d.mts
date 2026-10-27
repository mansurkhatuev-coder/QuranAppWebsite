export type PersonRecord = {
  id: string;
  name: string;
  born: number | null;
  died: number | null;
  gender: string;
  generation: number;
  parent: string | null;
  branch?: string;
  place?: string;
  photoUrl?: string | null;
};

export type StoryScene = {
  id: string;
  type: string;
  label: string;
  generation?: number;
  title: string;
  caption?: string;
  personIds: string[];
  branches?: { parentId: string; childIds: string[] }[];
};

export type TreeNode = {
  id: string;
  generation: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TreeEdge = {
  key: string;
  parentId: string;
  childId: string;
};

export type StoryShot = {
  id: string;
  type: string;
  label: string;
  generation?: number;
  title: string;
  caption: string;
  personIds: string[];
  startFrame: number;
  durationFrames: number;
  treeOffsetFrom: number;
  treeOffsetTo: number;
  cameraFrom: { x: number; y: number; zoom: number };
  cameraTo: { x: number; y: number; zoom: number };
  lineProgressFrom: number;
  lineProgressTo: number;
  activeEdgeKeys: string[];
};

export type CinematicTimeline = {
  fps: number;
  totalFrames: number;
  contentFrames: number;
  transitionFrames: number;
  layout: {
    width: number;
    height: number;
    cardWidth: number;
    cardHeight: number;
    nodes: TreeNode[];
    edges: TreeEdge[];
  };
  pathIds: string[];
  shots: StoryShot[];
};

export type StoryModel = {
  people: PersonRecord[];
  scenes: StoryScene[];
  timeline: CinematicTimeline;
  selectedPersonId: string;
  scopeType: "all" | "path" | "branch";
  title: string;
  includeDates: boolean;
};

export type FrameSample = {
  frame: number;
  shotIndex: number;
  shotId: string;
  shotType: string;
  label: string;
  title: string;
  caption: string;
  personIds: string[];
  activeEdgeKeys: string[];
  progress: number;
  easedProgress: number;
  camera: { x: number; y: number; zoom: number };
  treeOffsetY: number;
  lineProgress: number;
};

export const ACTIVE_CARD_REVEAL_FRAMES: number;
export const FOCUS_CAMERA_ARRIVAL_RATIO: number;
export const FOCUS_CAMERA_HOLD_RATIO: number;

export function buildRemotionStory(options?: {
  people?: PersonRecord[];
  scopeType?: "all" | "path" | "branch";
  selectedPersonId?: string;
  title?: string;
  includeDates?: boolean;
}): StoryModel;

export function formatPersonDateLabel(person: PersonRecord, includeDates?: boolean): string;

export function splitPersonName(value: string, maxLineLength?: number): string[];

export function getGenerationDateExcerpt(
  people: PersonRecord[],
  generation: number,
  options?: { intervalYears?: number; latestGenerationYear?: number }
): string;

export function getScenePresentation(shotType: string): {
  treeOffsetY: number;
  contextCardOpacity: number;
  contextLineOpacity: number;
};

export function getShotIndexAtFrame(story: StoryModel, frame: number): number;

export function getSceneTransitionProgress(story: StoryModel, shotIndex: number, localFrame: number): number;

export function getScenePersonEmphasis(story: StoryModel, shotIndex: number, localFrame: number, personId: string): number;

export function shouldRenderVideoPersonCard(story: StoryModel, shotIndex: number, personId: string, overview: boolean): boolean;

export function getSceneEdgeEmphasis(story: StoryModel, shotIndex: number, localFrame: number, edgeKey: string): number;

export function getSelectedCardReveal(shotType: string, localFrame: number): number;

export function getCameraFitScale(zoom: number): number;

export function getTreeViewportOpacity(scopeType: "all" | "path" | "branch", alpha: number): number;

export function getCinematicFraming(
  frameWidth: number,
  frameHeight: number,
  camera: { x: number; y: number; zoom: number },
  targetNodes: TreeNode[],
  treeOffsetY?: number
): {
  viewWidth: number;
  viewHeight: number;
  scale: number;
  translateX: number;
  translateY: number;
};

export function blendCinematicFraming(
  outgoing: { viewWidth: number; viewHeight: number; scale: number; translateX: number; translateY: number },
  incoming: { viewWidth: number; viewHeight: number; scale: number; translateX: number; translateY: number },
  progress: number
): { viewWidth: number; viewHeight: number; scale: number; translateX: number; translateY: number };

export function getCinematicFramingForFrame(
  story: StoryModel,
  frameWidth: number,
  frameHeight: number,
  frame: number
): { viewWidth: number; viewHeight: number; scale: number; translateX: number; translateY: number } | null;

export function getCinematicTitleFontSize(baseFontSize: number, title: string, availableWidth: number): number;

export function getCinematicTitleSafeZone(frameHeight: number, titleLength?: number): {
  top: number;
  height: number;
};

export function getBackgroundScale(frame: number, totalFrames: number): number;

export function getChapterCopyStartFrame(shot: StoryShot): number;

export function getChapterCopyTransitionOpacities(progress: number): {
  outgoing: number;
  incoming: number;
};

export function sampleRemotionFrame(story: StoryModel, frame: number): FrameSample | null;
