import { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useVideoConfig,
  useCurrentFrame
} from "remotion";
import type {
  StoryShot,
  PersonRecord,
  StoryModel,
  TreeNode
} from "./project-model.mjs";
import {
  formatPersonDateLabel,
  getGenerationDateExcerpt,
  splitPersonName,
  getBackgroundScale,
  getCinematicFramingForFrame,
  getCinematicTitleFontSize,
  getCinematicTitleSafeZone,
  getChapterCopyStartFrame,
  getChapterCopyTransitionOpacities,
  getSceneEdgeEmphasis,
  getScenePersonEmphasis,
  getSceneTransitionProgress,
  getScenePresentation,
  shouldRenderVideoPersonCard,
  getTreeViewportOpacity,
  sampleRemotionFrame
} from "./project-model.mjs";
import { REMOTION_COMPOSITION } from "./composition-config.mjs";

type Props = {
  story: StoryModel;
  shot: StoryShot;
  shotIndex: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function edgePath(
  parent: TreeNode,
  child: TreeNode,
  parentIsMarker: boolean,
  childIsMarker: boolean,
  markerRadius: number
) {
  const startY = parent.y + (parentIsMarker ? markerRadius : parent.height / 2 - 2);
  const endY = child.y - (childIsMarker ? markerRadius : child.height / 2 - 2);
  const bend = Math.max(18, (endY - startY) * 0.56);
  return "M " + parent.x + " " + startY
    + " C " + parent.x + " " + (startY + bend)
    + ", " + child.x + " " + (endY - bend)
    + ", " + child.x + " " + endY;
}

function sceneCaption(shot: StoryShot, story: StoryModel) {
  if (shot.caption) return shot.caption;
  if (shot.type === "generation") {
    const generation = Number(shot.generation ?? shot.label.match(/\d+/)?.[0]);
    if (story.includeDates && Number.isFinite(generation)) return getGenerationDateExcerpt(story.people, generation);
    return "Поколение " + (Number.isFinite(generation) ? generation : "рода") + " · связь сохраняется";
  }
  if (shot.type === "origin" && story.includeDates) {
    const firstGeneration = Math.min(...story.people.map(person => Number(person.generation ?? 0)));
    if (Number.isFinite(firstGeneration)) return getGenerationDateExcerpt(story.people, firstGeneration);
  }
  if (shot.type === "branching") return "От предка — к его потомкам";
  if (shot.type === "focus") return "Линия предков остаётся видимой";
  if (shot.type === "origin") return "История начинается со старшего известного предка";
  return "Родовая память проходит через поколения";
}

function PersonCard({
  person,
  node,
  emphasis,
  isTarget,
  includeDates,
  contextCardOpacity,
  edgeOpacity
}: {
  person: PersonRecord;
  node: TreeNode;
  emphasis: number;
  isTarget: boolean;
  includeDates: boolean;
  contextCardOpacity: number;
  edgeOpacity: number;
}) {
  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;
  const lines = splitPersonName(person.name);
  const textX = left + 67;
  const firstNameY = node.y - ((lines.length - 1) * 8);
  const fontSize = person.name.length > 18 ? 13 : 17;
  const avatarCx = left + 30;
  const avatarCy = node.y;

  return (
    <g opacity={(contextCardOpacity + (1 - contextCardOpacity) * emphasis) * edgeOpacity}>
      <title>{person.name + " · поколение " + person.generation}</title>
      {isTarget ? (
        <rect
          x={left - 4}
          y={top - 4}
          width={node.width + 8}
          height={node.height + 8}
          rx={16}
          fill="none"
          stroke="#d6ad5f"
          strokeWidth={1}
          filter="url(#waydean-focus-glow)"
          opacity={0.52}
        />
      ) : null}
      <rect
        x={left + 2}
        y={top + 7}
        width={node.width}
        height={node.height}
        rx={12}
        fill="#030707"
        opacity={0.7}
      />
      <rect
        x={left}
        y={top}
        width={node.width}
        height={node.height}
        rx={12}
        fill={isTarget ? "url(#waydean-card-selected)" : "url(#waydean-card)"}
        stroke={isTarget ? "#ead29a" : "rgba(223,190,124,0.64)"}
        strokeWidth={isTarget ? 1.5 : 1.2}
      />
      {isTarget ? null : (
        <rect
          x={left + 5}
          y={top + 5}
          width={node.width - 10}
          height={node.height - 10}
          rx={8}
          fill="none"
          stroke="rgba(255,238,197,0.17)"
          strokeWidth={0.8}
        />
      )}
      <circle
        cx={avatarCx}
        cy={avatarCy}
        r={22}
        fill="rgba(215,185,119,0.09)"
        stroke="rgba(228,197,129,0.55)"
        strokeWidth={1}
      />
      <path
        d={
          "M " + (avatarCx - 7) + " " + (avatarCy - 6)
          + " a 7 8 0 1 1 14 0 a 7 8 0 1 1 -14 0"
          + " M " + (avatarCx - 16) + " " + (avatarCy + 16)
          + " c 1 -9 7 -14 16 -14 s 15 5 16 14 c -7 4 -25 4 -32 0 Z"
        }
        fill="#d7c9ac"
        opacity={0.84}
      />
      <text
        x={textX}
        y={firstNameY}
        fill="#fff8e8"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize={fontSize}
        fontWeight={isTarget ? 700 : 500}
      >
        {lines.map((line, index) => (
          <tspan key={index} x={textX} dy={index === 0 ? 0 : 15}>
            {line}
          </tspan>
        ))}
      </text>
      {formatPersonDateLabel(person, includeDates) ? (
        <text
          x={textX}
          y={node.y + 34}
          fill="#d9c599"
          fontFamily="Arial, sans-serif"
          fontSize={11}
          letterSpacing={0.4}
        >
          {formatPersonDateLabel(person, includeDates)}
        </text>
      ) : null}
      <text
        x={left + node.width - 12}
        y={top + 15}
        textAnchor="end"
        fill="#bda36e"
        fontFamily="Arial, sans-serif"
        fontSize={9}
        letterSpacing={1.2}
      >
        {String(person.generation).padStart(2, "0")}
      </text>
    </g>
  );
}

function TreeMarker({ person, node, emphasis, isTarget, contextOpacity, markerRadius, edgeOpacity }: {
  person: PersonRecord;
  node: TreeNode;
  emphasis: number;
  isTarget: boolean;
  contextOpacity: number;
  markerRadius: number;
  edgeOpacity: number;
}) {
  return (
    <g opacity={(contextOpacity + (1 - contextOpacity) * emphasis) * edgeOpacity}>
      <title>{person.name + " · поколение " + person.generation}</title>
      {isTarget ? (
        <circle
          cx={node.x}
          cy={node.y}
          r={markerRadius + 6}
          fill="none"
          stroke="#fff0c7"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          filter="url(#waydean-gold-glow)"
        />
      ) : null}
      <circle
        cx={node.x}
        cy={node.y}
        r={markerRadius}
        fill="#101817"
        stroke={isTarget ? "#f0d797" : "#d7c18c"}
        strokeWidth={1.7}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={node.x} cy={node.y} r={Math.max(2, markerRadius * 0.34)} fill="#f0d797" />
    </g>
  );
}

export const CinematicShot = ({ story, shot, shotIndex }: Props) => {
  const { width: frameWidth, height: frameHeight } = useVideoConfig();
  const globalFrame = useCurrentFrame();
  const localFrame = Math.max(0, globalFrame - shot.startFrame);
  const nodesById = useMemo(
    () => new Map<string, TreeNode>(story.timeline.layout.nodes.map(node => [node.id, node])),
    [story.timeline.layout.nodes]
  );
  const peopleById = useMemo(
    () => new Map<string, PersonRecord>(story.people.map(person => [person.id, person])),
    [story.people]
  );
  const pathEdgeIndexes = useMemo(
    () => new Map<string, number>(story.timeline.pathIds.slice(1).map((id, index) => [
      story.timeline.pathIds[index] + "->" + id,
      index
    ])),
    [story.timeline.pathIds]
  );
  const revealedPersonIds = useMemo(
    () => new Set(story.timeline.layout.nodes
      .filter(node => shouldRenderVideoPersonCard(story, shotIndex, node.id, true))
      .map(node => node.id)),
    [story, shotIndex]
  );
  const sample = sampleRemotionFrame(story, globalFrame);
  if (!sample) return null;

  const camera = sample.camera;
  const presentation = getScenePresentation(shot.type);
  const framing = getCinematicFramingForFrame(story, frameWidth, frameHeight, globalFrame);
  if (!framing) return null;
  const overview = camera.zoom < 0.5 || framing.scale < 0.5;
  const markerRadius = overview ? clamp(5 / framing.scale, 8, 64) : 8;
  const transitionProgress = getSceneTransitionProgress(story, shotIndex, localFrame);
  const chapterProgress = shotIndex === 0
    ? interpolate(
      localFrame,
      [0, Math.min(24, shot.durationFrames - 1)],
      [0, 1],
      {
        easing: Easing.bezier(0.22, 0.7, 0.1, 1),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      }
    )
    : transitionProgress;
  const copyTransitionOpacities = getChapterCopyTransitionOpacities(transitionProgress);
  const outgoingShot = story.timeline.shots[shotIndex - 1];
  const outgoingTitle = outgoingShot?.title || story.title;
  const currentTitle = shot.title || story.title;
  const outgoingCaption = outgoingShot ? sceneCaption(outgoingShot, story) : "";
  const currentCaption = sceneCaption(shot, story);
  const sameTitleAcrossTransition = Boolean(outgoingShot && outgoingTitle === currentTitle);
  const sameCaptionAcrossTransition = Boolean(outgoingShot && outgoingCaption === currentCaption);
  const copyStartFrame = getChapterCopyStartFrame(shot);
  const delayedCopy = shot.type === "focus" || shot.type === "finale";
  const titleReveal = shotIndex === 0 || delayedCopy
    ? interpolate(localFrame, [copyStartFrame, copyStartFrame + 20], [0, 1], {
      easing: Easing.bezier(0.22, 0.7, 0.1, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    })
    : copyTransitionOpacities.incoming;
  const captionReveal = shotIndex === 0 || delayedCopy
    ? interpolate(localFrame, [copyStartFrame + 8, copyStartFrame + 30], [0, 1], {
      easing: Easing.bezier(0.22, 0.7, 0.1, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    })
    : copyTransitionOpacities.incoming;
  const backgroundScale = getBackgroundScale(sample.frame, story.timeline.totalFrames);
  const typographyScale = Math.max(0.7, Math.min(1, frameWidth / REMOTION_COMPOSITION.width));
  const safeInsetX = Math.round(frameWidth * 0.05625);
  const titleBottom = Math.round(frameHeight * (252 / 1080));
  const captionBottom = Math.round(frameHeight * (170 / 1080));
  const footerBottom = Math.round(frameHeight * (66 / 1080));
  const titleAvailableWidth = frameWidth - safeInsetX * 2;
  const titleBaseSize = (shot.type === "opening" || shot.type === "finale" ? 86 : 72) * typographyScale;
  const outgoingTitleBaseSize = (outgoingShot?.type === "opening" || outgoingShot?.type === "finale" ? 86 : 72) * typographyScale;
  const titleSize = getCinematicTitleFontSize(titleBaseSize, currentTitle, titleAvailableWidth);
  const outgoingTitleSize = getCinematicTitleFontSize(outgoingTitleBaseSize, outgoingTitle, titleAvailableWidth);
  const titleSafeZone = getCinematicTitleSafeZone(frameHeight, Math.max(currentTitle.length, outgoingTitle.length));
  return (
    <AbsoluteFill style={{ backgroundColor: "#070b0c", overflow: "hidden" }}>
      <Img
        src={staticFile("waydean-cinematic-background.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale: backgroundScale,
          translate: "0px 0px",
          filter: "brightness(0.66) saturate(0.78)"
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(3,7,8,0.58) 0%, rgba(4,8,8,0.13) 37%, rgba(3,7,7,0.58) 100%), linear-gradient(90deg, rgba(3,7,8,0.56) 0%, transparent 45%, rgba(3,7,8,0.24) 100%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 26%, rgba(2,5,6,0.16) 69%, rgba(2,5,6,0.58) 100%)"
        }}
      />

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${framing.viewWidth} ${framing.viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Кинематографическое древо для локального review"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <defs>
          <linearGradient id="waydean-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff0c7" />
            <stop offset="44%" stopColor="#e2bd70" />
            <stop offset="100%" stopColor="#a97636" />
          </linearGradient>
          <linearGradient id="waydean-card" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#202724" stopOpacity={0.98} />
            <stop offset="56%" stopColor="#0c1212" stopOpacity={0.99} />
            <stop offset="100%" stopColor="#080c0d" stopOpacity={0.99} />
          </linearGradient>
          <linearGradient id="waydean-card-selected" x1="0" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#443721" stopOpacity={0.98} />
            <stop offset="48%" stopColor="#171712" stopOpacity={0.99} />
            <stop offset="100%" stopColor="#0b0d0b" stopOpacity={0.99} />
          </linearGradient>
          <filter id="waydean-gold-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="waydean-focus-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        <g transform={"translate(" + framing.translateX + " " + framing.translateY + ") scale(" + framing.scale + ")"}>
          {story.timeline.layout.edges.map(edge => {
            const parent = nodesById.get(edge.parentId);
            const child = nodesById.get(edge.childId);
            if (!parent || !child) return null;
            const pathIndex = pathEdgeIndexes.get(edge.key);
            const isLineage = pathIndex != null;
            const progress = isLineage
              ? clamp(sample.lineProgress - pathIndex, 0, 1)
              : 1;
            const branchEmphasis = getSceneEdgeEmphasis(story, shotIndex, localFrame, edge.key);
            const contextLineOpacity = story.scopeType === "all"
              ? 0.22
              : shot.type === "opening" || shot.type === "finale" ? 0.24 : 0.08;
            const pathLead = isLineage && progress < 1;
            const edgeVisibility = getTreeViewportOpacity(story.scopeType, 1);
            const lineOpacity =
              (contextLineOpacity + branchEmphasis * (0.9 - contextLineOpacity)) * edgeVisibility;
            const parentIsMarker = overview && !revealedPersonIds.has(parent.id);
            const childIsMarker = overview && !revealedPersonIds.has(child.id);

            return (
              <g key={edge.key}>
                <path
                  d={edgePath(parent, child, parentIsMarker, childIsMarker, markerRadius)}
                  fill="none"
                  stroke="#e3c982"
                  strokeWidth={1.8 + branchEmphasis * 2.4}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={lineOpacity}
                  filter={branchEmphasis > 0.35 ? "url(#waydean-gold-glow)" : undefined}
                />
                {isLineage ? (
                  <path
                    d={edgePath(parent, child, parentIsMarker, childIsMarker, markerRadius)}
                    pathLength={1}
                    strokeDasharray="1"
                    strokeDashoffset={1 - progress}
                    fill="none"
                  stroke="url(#waydean-gold)"
                  strokeWidth={pathLead ? 4.2 : 1.8}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={(pathLead ? 0.9 : 0.12) * edgeVisibility}
                  filter={pathLead && edgeVisibility > 0 ? "url(#waydean-gold-glow)" : undefined}
                />
                ) : null}
              </g>
            );
          })}

          {story.timeline.layout.nodes.map(node => {
            const person = peopleById.get(node.id);
            if (!person) return null;
            const emphasis = getScenePersonEmphasis(story, shotIndex, localFrame, person.id);
            const isTarget =
              person.id === story.selectedPersonId
              && (shot.type === "focus" || shot.type === "finale");
            const edgeOpacity = getTreeViewportOpacity(story.scopeType, 1);

            return overview && !revealedPersonIds.has(person.id) ? (
              <TreeMarker
                key={person.id}
                person={person}
                node={node}
                emphasis={emphasis}
                isTarget={isTarget}
                contextOpacity={story.scopeType === "all" ? 1 : presentation.contextCardOpacity}
                markerRadius={markerRadius}
                edgeOpacity={edgeOpacity}
              />
            ) : (
              <PersonCard
                key={person.id}
                person={person}
                node={node}
                emphasis={emphasis}
                isTarget={isTarget}
                includeDates={story.includeDates}
                contextCardOpacity={story.scopeType === "all" ? 1 : presentation.contextCardOpacity}
                edgeOpacity={edgeOpacity}
              />
            );
          })}
        </g>
      </svg>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: titleSafeZone.top,
          height: titleSafeZone.height,
          pointerEvents: "none",
          background: "linear-gradient(180deg, rgba(4,8,8,0) 0%, rgba(4,8,8,0.46) 35%, rgba(4,8,8,0.84) 100%)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: safeInsetX,
          top: Math.round(frameHeight * (70 / 1080)),
          color: "#dec68f",
          fontFamily: "Arial, sans-serif",
          fontSize: Math.max(12, 17 * typographyScale),
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: "uppercase",
          opacity: chapterProgress * 0.94
        }}
      >
        WAYDEAN · FAMILY ARCHIVE
      </div>
      <div
        style={{
          position: "absolute",
          right: safeInsetX,
          top: Math.round(frameHeight * (70 / 1080)),
          color: "rgba(255,246,225,0.72)",
          fontFamily: "Arial, sans-serif",
          fontSize: Math.max(12, 15 * typographyScale),
          letterSpacing: 2.4,
          opacity: chapterProgress * 0.82
        }}
      >
        {String(story.timeline.shots.findIndex(item => item.id === shot.id) + 1).padStart(2, "0")}
        {"  /  "}
        {String(story.timeline.shots.length).padStart(2, "0")}
      </div>

      <Interactive.Div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: safeInsetX,
          bottom: titleBottom,
          maxWidth: frameWidth - safeInsetX * 2,
          overflowWrap: "anywhere",
          color: "#fff8e8",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: outgoingTitleSize,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: -1.8,
          opacity: outgoingShot && !sameTitleAcrossTransition ? copyTransitionOpacities.outgoing : 0,
          filter: "blur(" + (transitionProgress * 2) + "px)",
          textShadow: "0 3px 30px rgba(0,0,0,0.82)"
        }}
      >
        {outgoingTitle}
      </Interactive.Div>
      <Interactive.Div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: safeInsetX,
          bottom: captionBottom,
          maxWidth: frameWidth - safeInsetX * 2,
          color: "rgba(255,246,226,0.86)",
          fontFamily: "Arial, sans-serif",
          fontSize: 39 * typographyScale,
          fontWeight: 400,
          lineHeight: 1.2,
          opacity: outgoingShot && !sameCaptionAcrossTransition ? copyTransitionOpacities.outgoing : 0,
          filter: "blur(" + (transitionProgress * 1.5) + "px)",
          textShadow: "0 2px 18px rgba(0,0,0,0.86)"
        }}
      >
        {outgoingCaption}
      </Interactive.Div>
      <Interactive.Div
        name="Chapter title"
        style={{
          position: "absolute",
          left: safeInsetX,
          bottom: titleBottom,
          maxWidth: frameWidth - safeInsetX * 2,
          overflowWrap: "anywhere",
          color: "#fff8e8",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: titleSize,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: -1.8,
          opacity: sameTitleAcrossTransition ? 1 : titleReveal,
          translate: interpolate(localFrame, [copyStartFrame, copyStartFrame + 24], ["0px 22px", "0px 0px"], {
            easing: Easing.bezier(0.22, 0.7, 0.1, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          }),
          textShadow: "0 3px 30px rgba(0,0,0,0.82)"
        }}
      >
        {currentTitle}
      </Interactive.Div>
      <Interactive.Div
        name="Chapter caption"
        style={{
          position: "absolute",
          left: safeInsetX,
          bottom: captionBottom,
          maxWidth: frameWidth - safeInsetX * 2,
          color: "rgba(255,246,226,0.86)",
          fontFamily: "Arial, sans-serif",
          fontSize: 39 * typographyScale,
          fontWeight: 400,
          lineHeight: 1.2,
          opacity: sameCaptionAcrossTransition ? 1 : captionReveal,
          textShadow: "0 2px 18px rgba(0,0,0,0.86)"
        }}
      >
        {currentCaption}
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          right: safeInsetX,
          bottom: footerBottom,
          color: "rgba(239,218,173,0.68)",
          fontFamily: "Arial, sans-serif",
          fontSize: Math.max(12, 15 * typographyScale),
          fontWeight: 600,
          letterSpacing: 3,
          opacity: chapterProgress * 0.86
        }}
      >
        ДРЕВО ХОТИ · {story.people.length} ЗАПИСЕЙ
      </div>
    </AbsoluteFill>
  );
};
