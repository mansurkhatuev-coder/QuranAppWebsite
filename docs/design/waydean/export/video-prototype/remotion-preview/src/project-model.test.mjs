import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRemotionStory,
  formatPersonDateLabel,
  getCinematicFramingForFrame,
  getScenePersonEmphasis,
  getTreeViewportOpacity
} from "./project-model.mjs";

test("video person labels show a known birth without an unknown death marker", () => {
  assert.equal(formatPersonDateLabel({ born: 1999, died: null }), "род. 1999");
  assert.equal(formatPersonDateLabel({ born: null, died: 1850 }), "ум. 1850");
  assert.equal(formatPersonDateLabel({ born: 1999, died: 2024 }), "1999 — 2024");
  assert.equal(formatPersonDateLabel({ born: null, died: null }), "даты неизвестны");
  assert.equal(formatPersonDateLabel({ born: 1999, died: null }, false), "");
});

test("full-tree video keeps context cards visible until the frame clips them", () => {
  const viewport = { width: 100, height: 100 };
  const cardAtFrameEdge = { left: -2, top: 35, right: 28, bottom: 65 };

  assert.equal(getTreeViewportOpacity("all", 1, cardAtFrameEdge, viewport, 1), 1);
  assert.equal(getTreeViewportOpacity("path", 0.26, cardAtFrameEdge, viewport, 1), 0);
});

test("full-tree cards leave with the camera while other scopes smooth their edge fade", () => {
  const viewport = { width: 100, height: 100 };
  const centeredCard = { left: 35, top: 35, right: 65, bottom: 65 };
  const nextFrameAtEdge = { offset: 1, bounds: { left: -2, top: 35, right: 28, bottom: 65 } };

  assert.equal(getTreeViewportOpacity("all", 1, centeredCard, viewport, 1, 0, [nextFrameAtEdge]), 1);
  assert.equal(getTreeViewportOpacity("path", 1, centeredCard, viewport, 1, 0, [nextFrameAtEdge]), 0.12);
});

test("full-tree video keeps revealed cards solid while the camera moves to later generations", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null, born: 1880, died: null },
    { id: "child", name: "Потомок", generation: 2, parent: "root", born: 1907, died: null },
    { id: "grandchild", name: "Внук", generation: 3, parent: "child", born: 1934, died: null }
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "grandchild" });
  const generationTwoIndex = story.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 2);
  const generationThreeIndex = story.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 3);
  const middleOfGenerationTwo = Math.floor(story.timeline.shots[generationTwoIndex].durationFrames / 2);
  const middleOfGenerationThree = Math.floor(story.timeline.shots[generationThreeIndex].durationFrames / 2);

  assert.equal(getScenePersonEmphasis(story, generationTwoIndex, middleOfGenerationTwo, "root"), 1);
  assert.equal(getScenePersonEmphasis(story, generationThreeIndex, middleOfGenerationThree, "root"), 1);
});

test("full-tree finale gives the focused card a gradual camera exit", () => {
  const people = Array.from({ length: 14 }, (_, index) => ({
    id: `generation-${index + 1}`,
    name: `Поколение ${index + 1}`,
    generation: index + 1,
    parent: index ? `generation-${index}` : null
  }));
  const story = buildRemotionStory({
    people,
    scopeType: "all",
    selectedPersonId: "generation-14"
  });
  const focusShot = story.timeline.shots.find(shot => shot.type === "focus");
  const selectedNode = story.timeline.layout.nodes.find(node => node.id === "generation-14");
  const frameWidth = 1280;
  const frameHeight = 720;
  const cardWidthAt = frame => {
    const framing = getCinematicFramingForFrame(story, frameWidth, frameHeight, frame);
    const outputScale = Math.min(frameWidth / framing.viewWidth, frameHeight / framing.viewHeight);
    return selectedNode.width * framing.scale * outputScale;
  };

  let largestSingleFrameChange = 0;
  for (let frame = focusShot.startFrame + 1; frame < focusShot.startFrame + focusShot.durationFrames; frame += 1) {
    largestSingleFrameChange = Math.max(
      largestSingleFrameChange,
      Math.abs(cardWidthAt(frame) - cardWidthAt(frame - 1))
    );
  }

  assert.ok(focusShot.durationFrames >= story.timeline.fps * 5);
  assert.ok(largestSingleFrameChange <= 32, `largest card-size change was ${largestSingleFrameChange.toFixed(1)} px/frame`);
});
