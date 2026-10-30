import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRemotionStory,
  FULL_TREE_GENERATION_GROUP_SIZE,
  formatPersonDateLabel,
  getCinematicFramingForFrame,
  getFullTreeEdgeRevealProgress,
  getSceneEdgeEmphasis,
  getScenePersonEmphasis,
  getVideoCardDetailProgress,
  shouldRenderVideoPersonCard,
  getTreeViewportOpacity
} from "./project-model.mjs";

test("video person labels show a known birth without an unknown death marker", () => {
  assert.equal(formatPersonDateLabel({ born: 1999, died: null }), "род. 1999");
  assert.equal(formatPersonDateLabel({ born: null, died: 1850 }), "ум. 1850");
  assert.equal(formatPersonDateLabel({ born: 1999, died: 2024 }), "1999 — 2024");
  assert.equal(formatPersonDateLabel({ born: null, died: null }), "даты неизвестны");
  assert.equal(formatPersonDateLabel({ born: 1999, died: null }, false), "");
});

test("video scopes keep context cards visible until the frame clips them", () => {
  const viewport = { width: 100, height: 100 };
  const cardAtFrameEdge = { left: -2, top: 35, right: 28, bottom: 65 };

  assert.equal(getTreeViewportOpacity("all", 1, cardAtFrameEdge, viewport, 1), 1);
  assert.equal(getTreeViewportOpacity("path", 0.26, cardAtFrameEdge, viewport, 1), 0.26);
  assert.equal(getTreeViewportOpacity("branch", 0.42, cardAtFrameEdge, viewport, 1), 0.42);
});

test("cards in every scope leave with the camera instead of fading before the frame edge", () => {
  const viewport = { width: 100, height: 100 };
  const centeredCard = { left: 35, top: 35, right: 65, bottom: 65 };
  const nextFrameAtEdge = { offset: 1, bounds: { left: -2, top: 35, right: 28, bottom: 65 } };

  assert.equal(getTreeViewportOpacity("all", 1, centeredCard, viewport, 1, 0, [nextFrameAtEdge]), 1);
  assert.equal(getTreeViewportOpacity("path", 1, centeredCard, viewport, 1, 0, [nextFrameAtEdge]), 1);
  assert.equal(getTreeViewportOpacity("branch", 0.42, centeredCard, viewport, 1, 0, [nextFrameAtEdge]), 0.42);
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

test("overview keeps cards for people already revealed and uses markers only for unrevealed people", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    { id: "child", name: "Потомок", generation: 2, parent: "root" },
    { id: "grandchild", name: "Внук", generation: 3, parent: "child" }
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "grandchild" });
  const generationTwoIndex = story.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 2);
  const generationThreeIndex = story.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 3);

  assert.equal(shouldRenderVideoPersonCard(story, generationTwoIndex, "root", true), true);
  assert.equal(shouldRenderVideoPersonCard(story, generationTwoIndex, "child", true), true);
  assert.equal(shouldRenderVideoPersonCard(story, generationTwoIndex, "grandchild", true), false);
  assert.equal(shouldRenderVideoPersonCard(story, generationThreeIndex, "child", true), true);
  assert.equal(shouldRenderVideoPersonCard(story, generationThreeIndex, "grandchild", true), true);
  assert.equal(shouldRenderVideoPersonCard(story, generationThreeIndex, "grandchild", false), true);
});

test("camera begins each generation move with that scene instead of carrying cards away early", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    { id: "child", name: "Потомок", generation: 2, parent: "root" },
    { id: "grandchild", name: "Внук", generation: 3, parent: "child" }
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "grandchild" });
  const opening = story.timeline.shots.find(shot => shot.type === "opening");
  const origin = story.timeline.shots.find(shot => shot.type === "origin");
  const generationTwo = story.timeline.shots.find(shot => shot.type === "generation" && shot.generation === 2);
  const frameAt = frame => getCinematicFramingForFrame(story, 1280, 720, frame);
  const assertSameFraming = (actual, expected) => {
    for (const property of ["scale", "translateX", "translateY"]) {
      assert.ok(Math.abs(actual[property] - expected[property]) < 1e-9, `${property} changed unexpectedly`);
    }
  };
  const openingView = frameAt(opening.startFrame);
  const originStart = frameAt(origin.startFrame);
  const originMiddle = frameAt(origin.startFrame + Math.floor(origin.durationFrames / 2));
  const originEnd = frameAt(origin.startFrame + origin.durationFrames - 1);
  const generationTwoStart = frameAt(generationTwo.startFrame);

  assertSameFraming(originStart, openingView);
  assert.notDeepEqual(originMiddle, originStart);
  assertSameFraming(generationTwoStart, originEnd);
});

test("cinematic camera framing has no jump at any scene boundary", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    { id: "child", name: "Потомок", generation: 2, parent: "root" },
    { id: "grandchild", name: "Внук", generation: 3, parent: "child" }
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "grandchild" });
  const frameAt = frame => getCinematicFramingForFrame(story, 1280, 720, frame);

  for (const shot of story.timeline.shots.slice(1)) {
    const previous = story.timeline.shots[story.timeline.shots.indexOf(shot) - 1];
    const previousEnd = frameAt(previous.startFrame + previous.durationFrames - 1);
    const nextStart = frameAt(shot.startFrame);
    for (const property of ["scale", "translateX", "translateY"]) {
      assert.ok(
        Math.abs(previousEnd[property] - nextStart[property]) < 1e-9,
        `${property} jumped at the start of ${shot.type}`
      );
    }
  }
});

test("full-tree camera holds the previous frame briefly before carrying earlier cards out of view", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    { id: "child", name: "Потомок", generation: 2, parent: "root" },
    { id: "grandchild", name: "Внук", generation: 3, parent: "child" }
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "grandchild" });
  const shotIndex = story.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 2);
  const shot = story.timeline.shots[shotIndex];
  const previous = story.timeline.shots[shotIndex - 1];
  const at = frame => getCinematicFramingForFrame(story, 1280, 720, frame);
  const previousEnd = at(previous.startFrame + previous.durationFrames - 1);
  const held = at(shot.startFrame + 10);
  const moving = at(shot.startFrame + 60);

  for (const property of ["scale", "translateX", "translateY"]) {
    assert.ok(Math.abs(held[property] - previousEnd[property]) < 1e-9,
      `${property} should hold the previous frame before the camera starts moving`);
  }
  assert.ok(Math.abs(moving.translateY - held.translateY) > 1,
    "the camera should then move smoothly toward the next generation");
  assert.equal(getScenePersonEmphasis(story, shotIndex, 20, "root"), 1,
    "previous cards stay fully visible while the camera carries them out of frame");
});

test("path and branch videos keep previously revealed cards and connectors on the moving canvas", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    { id: "child", name: "Потомок", generation: 2, parent: "root" },
    { id: "grandchild", name: "Внук", generation: 3, parent: "child" },
    { id: "sibling", name: "Ветка", generation: 3, parent: "child" },
    { id: "great-grandchild", name: "Правнук", generation: 4, parent: "grandchild" }
  ];

  const pathStory = buildRemotionStory({ people, scopeType: "path", selectedPersonId: "great-grandchild" });
  const pathLaterIndex = pathStory.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 3);
  assert.equal(getScenePersonEmphasis(pathStory, pathLaterIndex, 90, "root"), 1);

  const branchStory = buildRemotionStory({ people, scopeType: "branch", selectedPersonId: "root" });
  const branchIndex = branchStory.timeline.shots.findIndex(shot => shot.type === "branching");
  const laterFocusIndex = branchStory.timeline.shots.findIndex((shot, index) => index > branchIndex && shot.type === "focus");
  assert.equal(getScenePersonEmphasis(branchStory, laterFocusIndex, 90, "child"), 1);
  assert.equal(getSceneEdgeEmphasis(branchStory, laterFocusIndex, 90, "child->grandchild"), 1);
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
  let largestCameraMove = 0;
  for (let frame = focusShot.startFrame + 1; frame < focusShot.startFrame + focusShot.durationFrames; frame += 1) {
    const previousFraming = getCinematicFramingForFrame(story, frameWidth, frameHeight, frame - 1);
    const currentFraming = getCinematicFramingForFrame(story, frameWidth, frameHeight, frame);
    largestCameraMove = Math.max(
      largestCameraMove,
      Math.abs(currentFraming.translateX - previousFraming.translateX),
      Math.abs(currentFraming.translateY - previousFraming.translateY)
    );
    largestSingleFrameChange = Math.max(
      largestSingleFrameChange,
      Math.abs(cardWidthAt(frame) - cardWidthAt(frame - 1))
    );
  }

  assert.ok(focusShot.durationFrames >= story.timeline.fps * 5);
  assert.ok(largestCameraMove <= 64, `largest camera move was ${largestCameraMove.toFixed(1)} px/frame`);
  assert.ok(largestSingleFrameChange <= 32, `largest card-size change was ${largestSingleFrameChange.toFixed(1)} px/frame`);
});

test("a 14-generation full-tree story stays within a watchable production duration", () => {
  const people = Array.from({ length: 14 }, (_, index) => ({
    id: `generation-${index + 1}`,
    name: `Поколение ${index + 1}`,
    generation: index + 1,
    parent: index ? `generation-${index}` : null
  }));
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "generation-14" });
  const durationSeconds = story.timeline.totalFrames / story.timeline.fps;

  assert.ok(durationSeconds >= 30, `the story should leave time to read its generations, got ${durationSeconds.toFixed(1)}s`);
  assert.ok(durationSeconds <= 75, `the story should stay near the 41-second preview, got ${durationSeconds.toFixed(1)}s`);
});

test("a 13-generation My Path export matches the 41-second preview duration", () => {
  const people = Array.from({ length: 13 }, (_, index) => ({
    id: `path-generation-${index + 1}`,
    name: `Поколение ${index + 1}`,
    generation: index + 1,
    parent: index ? `path-generation-${index}` : null
  }));
  const story = buildRemotionStory({
    people,
    scopeType: "path",
    selectedPersonId: "path-generation-13"
  });

  assert.equal(story.people.length, 13);
  assert.equal(story.timeline.shots.length, 16);
  assert.ok(Math.abs(story.timeline.totalFrames / story.timeline.fps - 41) <= 1);
});

test("full-tree generations move through spatially adjacent groups instead of isolated cards", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "child-18" });
  const scenes = story.timeline.shots.filter(shot => shot.type === "generation" && shot.generation === 2);
  const nodeX = new Map(story.timeline.layout.nodes.map(node => [node.id, node.x]));
  const shownIds = scenes.flatMap(scene => scene.personIds);

  assert.equal(scenes.length, 2);
  assert.ok(scenes.every(scene => scene.personIds.length <= FULL_TREE_GENERATION_GROUP_SIZE));
  assert.deepEqual(new Set(shownIds), new Set(people.slice(1).map(person => person.id)));
  for (const scene of scenes) {
    const positions = scene.personIds.map(id => nodeX.get(id));
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  }
});

test("full-tree generation draws sibling links together and keeps completed links visible", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    ...Array.from({ length: 3 }, (_, parentIndex) => ({
      id: `child-${parentIndex + 1}`,
      name: `Потомок ${parentIndex + 1}`,
      generation: 2,
      parent: "root"
    })),
    ...Array.from({ length: 3 }, (_, parentIndex) => [
      { id: `grandchild-${parentIndex + 1}-a`, name: "Внук А", generation: 3, parent: `child-${parentIndex + 1}` },
      { id: `grandchild-${parentIndex + 1}-b`, name: "Внук Б", generation: 3, parent: `child-${parentIndex + 1}` }
    ]).flat()
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "grandchild-3-b" });
  const generationShots = story.timeline.shots.filter(shot => shot.type === "generation");
  const generationTwoIndex = story.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 2);
  const generationThreeIndex = story.timeline.shots.findIndex(shot => shot.type === "generation" && shot.generation === 3);
  const generationTwo = story.timeline.shots[generationTwoIndex];
  const actualEdges = generationShots.flatMap(shot => shot.activeEdgeKeys).sort();
  const expectedEdges = people.filter(person => person.parent).map(person => `${person.parent}->${person.id}`).sort();

  assert.equal(story.timeline.shots.some(shot => shot.type === "branching"), false,
    "all-tree connectors should reveal with their generation, not replay in a late branch scene");
  assert.deepEqual(actualEdges, expectedEdges);
  assert.deepEqual(generationTwo.activeEdgeKeys.sort(), ["root->child-1", "root->child-2", "root->child-3"].sort());
  const revealFrame = Math.floor(generationTwo.durationFrames * 0.3);
  const siblingProgress = ["root->child-1", "root->child-2", "root->child-3"].map(edgeKey =>
    getFullTreeEdgeRevealProgress(story, generationTwoIndex, revealFrame, edgeKey));
  assert.ok(siblingProgress[0] > 0 && siblingProgress[0] < 1);
  assert.deepEqual(siblingProgress, [siblingProgress[0], siblingProgress[0], siblingProgress[0]],
    "siblings in the same generation should share one reveal clock");
  assert.equal(getFullTreeEdgeRevealProgress(story, generationThreeIndex, 0, "root->child-1"), 1,
    "completed connectors must remain fully drawn in later scenes");
  assert.equal(getFullTreeEdgeRevealProgress(story, generationTwoIndex, revealFrame, "child-1->grandchild-1-a"), 0,
    "future-generation connectors should wait for their own generation");
});

test("large generations reveal all their connectors in the first generation segment", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    ...Array.from({ length: FULL_TREE_GENERATION_GROUP_SIZE + 1 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "child-1" });
  const generationTwo = story.timeline.shots.filter(shot => shot.type === "generation" && shot.generation === 2);
  const expectedEdges = people.filter(person => person.parent).map(person => `root->${person.id}`).sort();

  assert.equal(generationTwo.length, 2, "the card reveal may be segmented for a large generation");
  assert.deepEqual(generationTwo[0].activeEdgeKeys.sort(), expectedEdges,
    "all sibling links should share one generation-level reveal");
  assert.deepEqual(generationTwo[1].activeEdgeKeys, [],
    "later card segments must not replay their connectors");
});

test("full-tree cards blend smoothly from overview markers to detailed cards", () => {
  assert.equal(getVideoCardDetailProgress(36), 0);
  const samples = [44, 64, 84, 104, 124, 144].map(getVideoCardDetailProgress);
  assert.ok(samples.every(value => value > 0 && value < 1));
  assert.deepEqual(samples, [...samples].sort((left, right) => left - right));
  assert.equal(getVideoCardDetailProgress(160), 1);
});

test("full-tree cards share one detail threshold across the selected lineage and side branches", () => {
  assert.equal(getVideoCardDetailProgress(30), 0);
  assert.ok(getVideoCardDetailProgress(80) > 0 && getVideoCardDetailProgress(80) < 1);
  assert.equal(getVideoCardDetailProgress(160), 1);
});

test("full-tree keeps the selected lineage available for connector emphasis", () => {
  const people = [
    { id: "root", name: "Родоначальник", generation: 1, parent: null },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people, selectedPersonId: "child-9", scopeType: "all" });
  assert.deepEqual(story.timeline.pathIds, ["root", "child-9"]);
});

test("full-tree focus keeps the previous branch in frame during the camera approach", () => {
  const people = Array.from({ length: 13 }, (_, index) => ({
    id: `ancestor-${index + 1}`,
    name: `Предок ${index + 1}`,
    generation: index + 1,
    parent: index ? `ancestor-${index}` : null
  }));
  people.push(
    { id: "selected", name: "Выбранный человек", generation: 14, parent: "ancestor-13" },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `sibling-${index + 1}`,
      name: `Брат ${index + 1}`,
      generation: 14,
      parent: "ancestor-13"
    }))
  );
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "selected" });
  const focusIndex = story.timeline.shots.findIndex(shot => shot.type === "focus");
  const focus = story.timeline.shots[focusIndex];
  const sibling = story.timeline.layout.nodes.find(node => node.id === "sibling-3");
  const frame = focus.startFrame + Math.floor(focus.durationFrames * 0.2);
  const framing = getCinematicFramingForFrame(story, 1280, 720, frame);
  const left = sibling.x * framing.scale + framing.translateX - sibling.width * framing.scale / 2;
  const right = sibling.x * framing.scale + framing.translateX + sibling.width * framing.scale / 2;
  const top = sibling.y * framing.scale + framing.translateY - sibling.height * framing.scale / 2;
  const bottom = sibling.y * framing.scale + framing.translateY + sibling.height * framing.scale / 2;

  assert.ok(right > 0 && left < 1280 && bottom > 0 && top < 720, "the previous branch card should leave through the frame edge, not vanish during the approach");
});

test("full-tree video stretches only long camera moves to keep prior cards moving smoothly", () => {
  const people = [
    { id: "root", name: "Предок", generation: 1, parent: null },
    ...Array.from({ length: 36 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people, scopeType: "all", selectedPersonId: "child-36" });
  const pathStory = buildRemotionStory({ people, scopeType: "path", selectedPersonId: "child-36" });
  let maximumMove = 0;

  for (const [width, height] of [[1280, 720], [720, 1280], [720, 720]]) {
    for (let frame = 1; frame < story.timeline.totalFrames; frame += 1) {
      const previous = getCinematicFramingForFrame(story, width, height, frame - 1);
      const current = getCinematicFramingForFrame(story, width, height, frame);
      const outputScale = Math.min(width / current.viewWidth, height / current.viewHeight);
      for (const node of story.timeline.layout.nodes) {
        const dx = (node.x * current.scale + current.translateX - node.x * previous.scale - previous.translateX) * outputScale;
        const dy = (node.y * current.scale + current.translateY - node.y * previous.scale - previous.translateY) * outputScale;
        maximumMove = Math.max(maximumMove, Math.hypot(dx, dy));
      }
    }
  }

  assert.ok(maximumMove <= 64, `largest revealed-card movement was ${maximumMove.toFixed(1)} px/frame`);
  assert.equal(pathStory.timeline.shots.find(shot => shot.type === "focus").durationFrames, pathStory.timeline.fps * 3);
});
