import { Composition, Folder } from "remotion";
import {
  DEFAULT_FAMILY_HISTORY_PROPS,
  REMOTION_COMPOSITION
} from "./composition-config.mjs";
import {
  calculateMetadata,
  FamilyHistoryVideo
} from "./Composition";

export const RemotionRoot: React.FC = () => (
  <Folder name="Waydean">
    <Composition
      id={REMOTION_COMPOSITION.id}
      component={FamilyHistoryVideo}
      durationInFrames={1}
      fps={REMOTION_COMPOSITION.fps}
      width={REMOTION_COMPOSITION.width}
      height={REMOTION_COMPOSITION.height}
      calculateMetadata={calculateMetadata}
      defaultProps={DEFAULT_FAMILY_HISTORY_PROPS}
    />
  </Folder>
);
