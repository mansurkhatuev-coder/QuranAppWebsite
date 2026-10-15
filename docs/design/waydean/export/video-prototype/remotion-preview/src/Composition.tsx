import { useMemo } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  type CalculateMetadataFunction
} from "remotion";
import { CinematicShot } from "./CinematicShot";
import { getVideoFormat } from "./composition-config.mjs";
import { buildRemotionStory, getShotIndexAtFrame } from "./project-model.mjs";
import type { StoryModel } from "./project-model.mjs";

export type FamilyHistoryProps = {
  title: string;
  scopeType: "all" | "path" | "branch";
  selectedPersonId: string;
  includeDates: boolean;
  aspectRatio: "16:9" | "9:16" | "1:1";
};

export const calculateMetadata: CalculateMetadataFunction<FamilyHistoryProps> = ({ props }) => {
  const story = buildRemotionStory(props);
  const frame = getVideoFormat(props.aspectRatio);
  return {
    durationInFrames: story.timeline.totalFrames,
    width: frame.width,
    height: frame.height
  };
};

export const FamilyHistoryVideo = (props: FamilyHistoryProps) => {
  const { scopeType, selectedPersonId, title, includeDates } = props;
  const story: StoryModel = useMemo(
    () => buildRemotionStory({ scopeType, selectedPersonId, title, includeDates }),
    [scopeType, selectedPersonId, title, includeDates]
  );
  const frame = useCurrentFrame();
  const shotIndex = getShotIndexAtFrame(story, frame);
  const shot = story.timeline.shots[shotIndex];

  return (
    <AbsoluteFill>
      {shot ? <CinematicShot story={story} shot={shot} shotIndex={shotIndex} /> : null}
    </AbsoluteFill>
  );
};
