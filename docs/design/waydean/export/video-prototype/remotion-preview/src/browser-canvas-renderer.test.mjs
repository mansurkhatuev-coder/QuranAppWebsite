import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  buildRemotionStory,
  getCinematicFramingForFrame,
  getVideoCardDetailProgress,
  getVideoCardContentProgress,
  sampleRemotionFrame
} from "./project-model.mjs";
import {
  buildBrowserRenderPlan,
  getSourceFrameForBrowserExport,
  createBrowserCanvasFrameRenderer
} from "./browser-canvas-renderer.mjs";
import * as browserCanvasRenderer from "./browser-canvas-renderer.mjs";
import { getVideoBackgroundOutputTimestamp } from "./video-backgrounds.mjs";

const people = [
  { id: "root", name: "Куди", generation: 1, parent: null, born: 1000, died: null },
  { id: "child-a", name: "Гьоймирза", generation: 2, parent: "root", born: null, died: null },
  { id: "child-b", name: "Исмаал", generation: 2, parent: "root", born: null, died: null }
];

function fakeCanvasContext() {
  const calls = [];
  const gradient = { addColorStop: (...args) => calls.push(["color-stop", ...args]) };
  const context = {
    calls,
    globalAlpha: 1,
    filter: "none",
    beginPath: () => calls.push(["begin"]),
    moveTo: (...args) => calls.push(["move", ...args]),
    lineTo: (...args) => calls.push(["line", ...args]),
    bezierCurveTo: (...args) => calls.push(["curve", ...args]),
    quadraticCurveTo: (...args) => calls.push(["quadratic", ...args]),
    roundRect: (...args) => calls.push(["round-rect", ...args, context.globalAlpha]),
    closePath: () => calls.push(["close"]),
    fill: () => calls.push(["fill"]),
    stroke: () => calls.push(["stroke"]),
    arc: (...args) => calls.push(["arc", ...args]),
    fillRect: (...args) => calls.push(["fill-rect", ...args]),
    drawImage: (...args) => calls.push(["image", ...args, context.filter]),
    fillText: (...args) => calls.push(["text", ...args, context.globalAlpha]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (...args) => calls.push(["translate", ...args]),
    scale: (...args) => calls.push(["scale", ...args]),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient
  };
  return context;
}

test("browser video render stays at 720p or below and preserves the selected aspect ratio", () => {
  const story = buildRemotionStory({ people, selectedPersonId: "child-a" });
  const landscape = buildBrowserRenderPlan(story, "16:9");
  const portrait = buildBrowserRenderPlan(story, "9:16");
  const square = buildBrowserRenderPlan(story, "1:1");

  assert.deepEqual([landscape.width, landscape.height], [1280, 720]);
  assert.deepEqual([portrait.width, portrait.height], [720, 1280]);
  assert.deepEqual([square.width, square.height], [720, 720]);
  assert.equal(landscape.fps, 24);
  assert.equal(landscape.totalFrames, Math.round(landscape.durationSeconds * landscape.fps));
});

test("browser output frame maps back to the shared 30 fps story timeline", () => {
  const story = buildRemotionStory({ people, selectedPersonId: "child-a" });
  const plan = buildBrowserRenderPlan(story, "16:9");

  assert.equal(getSourceFrameForBrowserExport(0, plan), 0);
  assert.equal(getSourceFrameForBrowserExport(1, plan), 1);
  assert.equal(getSourceFrameForBrowserExport(2, plan), 2);
  assert.equal(getSourceFrameForBrowserExport(plan.totalFrames - 1, plan), plan.sourceFrames - 1);
});

test("browser render speed changes exported duration and source-frame sampling", () => {
  const story = buildRemotionStory({ people, selectedPersonId: "child-a" });
  const normal = buildBrowserRenderPlan(story, "16:9");
  const fast = buildBrowserRenderPlan(story, "16:9", 720, 24, 4);
  const slow = buildBrowserRenderPlan(story, "16:9", 720, 24, 0.25);

  assert.equal(fast.speed, 4);
  assert.equal(fast.durationSeconds, normal.durationSeconds / 4);
  assert.equal(fast.totalFrames, Math.round(normal.totalFrames / 4));
  assert.equal(getSourceFrameForBrowserExport(24, fast), 120);
  assert.equal(getVideoBackgroundOutputTimestamp(24, fast.fps), 1);
  assert.equal(slow.speed, 0.25);
  assert.equal(slow.durationSeconds, normal.durationSeconds * 4);
  assert.equal(getSourceFrameForBrowserExport(24, slow), 7);
  assert.equal(getVideoBackgroundOutputTimestamp(24, slow.fps), 1,
    "the background advances one output second regardless of animation speed");
});

test("browser canvas renderer draws a decoded background sample before the tree frame", () => {
  const story = buildRemotionStory({ people, selectedPersonId: "child-a" });
  const context = fakeCanvasContext();
  const canvas = { width: 1280, height: 720, getContext: () => context };
  const sample = {
    displayWidth: 1920,
    displayHeight: 1080,
    draw: (...args) => context.calls.push(["video-sample", ...args.slice(1)])
  };
  const renderFrame = createBrowserCanvasFrameRenderer({
    canvas,
    story,
    backgroundImage: { width: 1600, height: 900 }
  });

  renderFrame(0, sample);

  const sampleDrawIndex = context.calls.findIndex(call => call[0] === "video-sample");
  const treeDrawIndex = context.calls.findIndex(call => call[0] === "round-rect");
  assert.ok(sampleDrawIndex >= 0, "a decoded video sample should be drawn instead of the still background");
  assert.ok(treeDrawIndex > sampleDrawIndex, "tree cards must be composited on top of the video background");
});

test("moving backgrounds are composited without a per-frame canvas filter", () => {
  const story = buildRemotionStory({ people, selectedPersonId: "child-a" });
  const frames = [
    {
      displayWidth: 1920,
      displayHeight: 1080,
      draw: (_context) => _context.calls.push(["video-filter", _context.filter])
    },
    { videoWidth: 1920, videoHeight: 1080 }
  ];

  for (const frame of frames) {
    const context = fakeCanvasContext();
    const canvas = { width: 1280, height: 720, getContext: () => context };
    createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(0, frame);
    if (typeof frame.draw === "function") {
      assert.deepEqual(context.calls.find(call => call[0] === "video-filter"), ["video-filter", "none"]);
    } else {
      assert.equal(context.calls.find(call => call[0] === "image").at(-1), "none");
    }
  }
});

test("overview markers keep a readable radius in exported pixels at very small camera zoom", () => {
  for (const [framingScale, outputScale] of [[0.01, 0.75], [0.08, 1], [0.2, 1.2]]) {
    const radius = browserCanvasRenderer.getOverviewMarkerRadius(framingScale, outputScale);
    assert.ok(Math.abs(radius * framingScale * outputScale - 4) < 1e-9);
  }
});

test("overview card silhouettes stay rectangular and consistently sized in exported pixels", () => {
  for (const [framingScale, outputScale] of [[0.01, 0.75], [0.08, 1], [0.2, 1.2]]) {
    const card = browserCanvasRenderer.getOverviewCardGeometry(browserCanvasRenderer.getOverviewMarkerRadius(framingScale, outputScale));
    assert.ok(card.width > card.height);
    assert.ok(card.cornerRadius > 0);
    assert.ok(card.cornerRadius < card.height / 2);
    assert.ok(Math.abs(card.width * framingScale * outputScale - 10.4) < 1e-9);
    assert.ok(Math.abs(card.height * framingScale * outputScale - 5.6) < 1e-9);
  }
});

test("overview card outlines keep a visible screen-pixel stroke at every camera scale", () => {
  for (const [framingScale, outputScale] of [[0.01, 0.75], [0.08, 1], [0.2, 1.2]]) {
    const totalScale = framingScale * outputScale;
    const radius = browserCanvasRenderer.getOverviewMarkerRadius(framingScale, outputScale);
    const worldStrokeWidth = browserCanvasRenderer.getOverviewMarkerWorldStrokeWidth(radius, 1.4);
    assert.ok(Math.abs(worldStrokeWidth * totalScale - 1.4) < 1e-9,
      `overview outline should stay 1.4 output pixels at ${totalScale}x`);
  }
});

test("overview video connectors end at the rectangular card edge", () => {
  const rendererSource = readFileSync(new URL("./browser-canvas-renderer.mjs", import.meta.url), "utf8");
  assert.equal(browserCanvasRenderer.getOverviewCardHalfHeight(4), 2.8);
  assert.equal((rendererSource.match(/const markerHalfHeight = getOverviewCardHalfHeight\(markerRadius\)/g) ?? []).length, 2,
    "curved and orthogonal connectors must both use the marker card half-height, not its round radius");
});

test("full-tree overview video draws a compact card silhouette for every generation", () => {
  const multigenerationalPeople = Array.from({ length: 14 }, (_, index) => ({
    id: `generation-${index + 1}`,
    name: `Поколение ${index + 1}`,
    generation: index + 1,
    parent: index ? `generation-${index}` : null
  }));
  const story = buildRemotionStory({
    people: multigenerationalPeople,
    selectedPersonId: "generation-14",
    scopeType: "all"
  });
  const shot = story.timeline.shots[0];
  const frame = shot.startFrame;
  const sample = sampleRemotionFrame(story, frame);
  const framing = getCinematicFramingForFrame(story, 1280, 720, frame);
  const context = fakeCanvasContext();
  const canvas = { width: 1280, height: 720, getContext: () => context };

  assert.ok(sample.camera.zoom < 0.5 || framing.scale < 0.5, "the opening shot should use overview cards");
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(frame);

  const cardTransforms = context.calls.filter(call => call[0] === "scale");
  assert.ok(cardTransforms.length >= multigenerationalPeople.length,
    "every generation should receive an adaptive card silhouette");
});

test("full-tree cards expand from compact markers without fading their dark backing", () => {
  const branchPeople = [
    { id: "root", name: "Родоначальник", generation: 1, parent: null },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people: branchPeople, selectedPersonId: "child-9", scopeType: "all" });
  const node = story.timeline.layout.nodes.find(item => item.id === "child-1");
  const frame = Array.from({ length: story.timeline.totalFrames }, (_, candidate) => candidate)
    .find(candidate => {
      const framing = getCinematicFramingForFrame(story, 1280, 720, candidate);
      const outputScale = Math.min(1280 / framing.viewWidth, 720 / framing.viewHeight);
      const progress = getVideoCardDetailProgress(node.width * framing.scale * outputScale);
      const markerRadius = browserCanvasRenderer.getOverviewMarkerRadius(framing.scale, outputScale);
      const geometry = browserCanvasRenderer.getVideoCardRevealGeometry(node, progress, markerRadius);
      return progress > 0.55 && progress < 0.8
        && geometry.width * framing.scale * outputScale < 88;
    });
  const context = fakeCanvasContext();
  const canvas = { width: 1280, height: 720, getContext: () => context };

  assert.notEqual(frame, undefined, "camera travel should pass through the compact-to-detail range");
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(frame);

  const framing = getCinematicFramingForFrame(story, 1280, 720, frame);
  const outputScale = Math.min(1280 / framing.viewWidth, 720 / framing.viewHeight);
  const markerRadius = browserCanvasRenderer.getOverviewMarkerRadius(framing.scale, outputScale);
  const marker = browserCanvasRenderer.getOverviewCardGeometry(markerRadius);
  const detailProgress = getVideoCardDetailProgress(node.width * framing.scale * outputScale);
  const geometry = browserCanvasRenderer.getVideoCardRevealGeometry(node, detailProgress, markerRadius);
  const body = context.calls.find(call => call[0] === "round-rect"
    && Math.abs(call[1] - (node.x - node.width / 2)) < 1e-6
    && Math.abs(call[2] - (node.y - node.height / 2)) < 1e-6
    && call[3] === node.width && call[4] === node.height);

  assert.ok(geometry.width > marker.width && geometry.width < node.width,
    "the compact silhouette should grow smoothly to the full card size");
  assert.ok(body, "the interpolated silhouette should be drawn as a family card");
  assert.equal(body[6], 1, "the card backing must stay opaque throughout the zoom transition");
  assert.equal(getVideoCardContentProgress(geometry.width * framing.scale * outputScale), 0,
    "text remains hidden until the actually visible card has room for legible details");
  assert.equal(context.calls.some(call => call[0] === "text" && call[1] === "Потомок 1"), false,
    "subpixel name glyphs must not flicker as white bars");
});

test("card reveal geometry interpolates from a consistent dark mini-card to the full block", () => {
  const node = { x: 40, y: 60, width: 180, height: 76 };
  const marker = browserCanvasRenderer.getOverviewCardGeometry(4);
  const start = browserCanvasRenderer.getVideoCardRevealGeometry(node, 0, 4);
  const middle = browserCanvasRenderer.getVideoCardRevealGeometry(node, 0.5, 4);
  const end = browserCanvasRenderer.getVideoCardRevealGeometry(node, 1, 4);

  assert.deepEqual([start.width, start.height], [marker.width, marker.height]);
  assert.ok(middle.width > start.width && middle.width < end.width);
  assert.ok(middle.height > start.height && middle.height < end.height);
  assert.deepEqual([end.width, end.height], [node.width, node.height]);
});

test("full-tree video opens revealed selected-lineage cards at medium zoom", () => {
  const branchPeople = [
    { id: "root", name: "Родоначальник", generation: 1, parent: null },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people: branchPeople, selectedPersonId: "child-9", scopeType: "all" });
  const pathNode = story.timeline.layout.nodes.find(node => node.id === "child-9");
  const branchNode = story.timeline.layout.nodes.find(node => node.id === "child-1");
  pathNode.width = branchNode.width;
  const frame = Array.from({ length: story.timeline.totalFrames }, (_, candidate) => candidate)
    .find(candidate => {
      const shot = story.timeline.shots.find(item => candidate >= item.startFrame && candidate < item.startFrame + item.durationFrames);
      if (!shot?.personIds?.includes("child-9")) return false;
      const framing = getCinematicFramingForFrame(story, 1280, 720, candidate);
      const outputScale = Math.min(1280 / framing.viewWidth, 720 / framing.viewHeight);
      const branchProgress = getVideoCardDetailProgress(branchNode.width * framing.scale * outputScale);
      return branchProgress > 0.2 && branchProgress < 0.8;
    });
  const context = fakeCanvasContext();
  const canvas = { width: 1280, height: 720, getContext: () => context };

  assert.notEqual(frame, undefined, "the selected generation should pass through medium zoom");
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(frame);

  const framing = getCinematicFramingForFrame(story, 1280, 720, frame);
  const outputScale = Math.min(1280 / framing.viewWidth, 720 / framing.viewHeight);
  const markerRadius = browserCanvasRenderer.getOverviewMarkerRadius(framing.scale, outputScale);
  const pathGeometry = browserCanvasRenderer.getVideoCardRevealGeometry(pathNode,
    getVideoCardDetailProgress(pathNode.width * framing.scale * outputScale, true), markerRadius);
  const branchGeometry = browserCanvasRenderer.getVideoCardRevealGeometry(branchNode,
    getVideoCardDetailProgress(branchNode.width * framing.scale * outputScale), markerRadius);
  const hasCardScale = geometry => context.calls.some(call => call[0] === "scale"
    && Math.abs(call[1] - geometry.scaleX) < 1e-6
    && Math.abs(call[2] - geometry.scaleY) < 1e-6);

  assert.equal(pathGeometry.scaleX, 1,
    "a revealed selected-lineage card should open fully even before the camera reaches close-up");
  assert.ok(branchGeometry.scaleX > 0 && branchGeometry.scaleX < 1,
    "other cards should keep their smooth zoom-based reveal");
  assert.ok(hasCardScale(pathGeometry));
  assert.ok(hasCardScale(branchGeometry));
  const pathName = context.calls.find(call => call[0] === "text" && call[1] === "Потомок 9");
  assert.equal(Boolean(pathName), true,
    "the selected-lineage card should reveal its name once the medium-zoom card has readable space");
});

test("157-person full-tree video follows the selected lineage into a readable generation frame", () => {
  const generationSizes = [1, 2, 2, 1, 4, 8, 2, 8, 13, 12, 12, 28, 40, 24];
  const largeFamily = [];
  let previousGeneration = [];
  for (let generationIndex = 0; generationIndex < generationSizes.length; generationIndex += 1) {
    const generation = generationIndex + 1;
    const currentGeneration = Array.from({ length: generationSizes[generationIndex] }, (_, index) => {
      const id = generation === 13 && index === 19 ? "mansur" : `generation-${generation}-person-${index + 1}`;
      const parent = previousGeneration.length
        ? previousGeneration[Math.floor(index * previousGeneration.length / generationSizes[generationIndex])]
        : null;
      return {
        id,
        name: id === "mansur" ? "Мансур" : `Человек ${generation}-${index + 1}`,
        generation,
        parent
      };
    });
    largeFamily.push(...currentGeneration);
    previousGeneration = currentGeneration.map(person => person.id);
  }
  const story = buildRemotionStory({ people: largeFamily, selectedPersonId: "mansur", scopeType: "all" });
  const shot = story.timeline.shots.find(item => item.type === "generation"
    && item.generation === 13 && item.personIds.includes("mansur"));
  const frame = shot.startFrame + shot.durationFrames - 1;
  const node = story.timeline.layout.nodes.find(item => item.id === "mansur");
  const framing = getCinematicFramingForFrame(story, 1280, 720, frame);
  const outputScale = Math.min(1280 / framing.viewWidth, 720 / framing.viewHeight);
  const renderedWidth = node.width * framing.scale * outputScale;
  const context = fakeCanvasContext();
  const canvas = { width: 1280, height: 720, getContext: () => context };

  assert.equal(largeFamily.length, 157);
  assert.equal(story.timeline.shots.length, 19, "the full-tree sequence should not gain extra slides");
  assert.ok(shot.cameraPersonIds.includes("mansur"), "the generation shot should frame the selected lineage card");
  assert.ok(renderedWidth >= 128,
    `the selected card should have room for its label at ${renderedWidth.toFixed(1)}px`);
  assert.equal(getVideoCardContentProgress(renderedWidth), 1);
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(frame);

  assert.equal(context.calls.some(call => call[0] === "text" && call[1] === "Мансур"), true,
    "the selected lineage card should be fully open in the large-tree generation scene");
});

test("tiny tree cards keep their dark silhouette without rendering white text into blocks", () => {
  const branchPeople = [
    { id: "root", name: "Родоначальник", generation: 1, parent: null },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people: branchPeople, selectedPersonId: "child-9", scopeType: "all" });
  const node = story.timeline.layout.nodes.find(item => item.id === "child-1");
  const frame = Array.from({ length: story.timeline.totalFrames }, (_, candidate) => candidate)
    .find(candidate => {
      const shot = story.timeline.shots.find(item => candidate >= item.startFrame && candidate < item.startFrame + item.durationFrames);
      if (!shot?.personIds?.includes("child-1")) return false;
      const framing = getCinematicFramingForFrame(story, 720, 1280, candidate);
      const outputScale = Math.min(720 / framing.viewWidth, 1280 / framing.viewHeight);
      const projectedWidth = node.width * framing.scale * outputScale;
      return projectedWidth < 76 && getVideoCardDetailProgress(projectedWidth) > 0;
    });
  const context = fakeCanvasContext();
  const canvas = { width: 720, height: 1280, getContext: () => context };

  assert.notEqual(frame, undefined, "the camera should cross the tiny-card detail transition");
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(frame);

  assert.equal(context.calls.some(call => call[0] === "text" && call[1] === "Потомок 1"), false,
    "tiny bright name glyphs should stay hidden until there is enough room to render them cleanly");
  assert.equal(context.calls.some(call => call[0] === "round-rect" && call[3] === node.width && call[4] === node.height), true,
    "the dark card silhouette should remain visible during the transition");
});

test("card text and avatars fade in only when there is enough screen space to render them cleanly", () => {
  assert.equal(getVideoCardContentProgress(87), 0);
  assert.ok(getVideoCardContentProgress(108) > 0 && getVideoCardContentProgress(108) < 1);
  assert.equal(getVideoCardContentProgress(128), 1);
});


test("tiny tree cards keep their dark silhouette without rendering white text into blocks", () => {
  const branchPeople = [
    { id: "root", name: "Родоначальник", generation: 1, parent: null },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `child-${index + 1}`,
      name: `Потомок ${index + 1}`,
      generation: 2,
      parent: "root"
    }))
  ];
  const story = buildRemotionStory({ people: branchPeople, selectedPersonId: "child-9", scopeType: "all" });
  const node = story.timeline.layout.nodes.find(item => item.id === "child-1");
  const frame = Array.from({ length: story.timeline.totalFrames }, (_, candidate) => candidate)
    .find(candidate => {
      const shot = story.timeline.shots.find(item => candidate >= item.startFrame && candidate < item.startFrame + item.durationFrames);
      if (!shot?.personIds?.includes("child-1")) return false;
      const framing = getCinematicFramingForFrame(story, 720, 1280, candidate);
      const outputScale = Math.min(720 / framing.viewWidth, 1280 / framing.viewHeight);
      const projectedWidth = node.width * framing.scale * outputScale;
      return projectedWidth < 76 && getVideoCardDetailProgress(projectedWidth) > 0;
    });
  const context = fakeCanvasContext();
  const canvas = { width: 720, height: 1280, getContext: () => context };

  assert.notEqual(frame, undefined, "the camera should cross the tiny-card detail transition");
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(frame);

  assert.equal(context.calls.some(call => call[0] === "text" && call[1] === "Потомок 1"), false,
    "tiny bright name glyphs should stay hidden until there is enough room to render them cleanly");
  assert.equal(context.calls.some(call => call[0] === "round-rect" && call[3] === node.width && call[4] === node.height), true,
    "the dark card silhouette should remain visible during the transition");
});

test("card text and avatars fade in only when there is enough screen space to render them cleanly", () => {
  assert.equal(getVideoCardContentProgress(87), 0);
  assert.ok(getVideoCardContentProgress(108) > 0 && getVideoCardContentProgress(108) < 1);
  assert.equal(getVideoCardContentProgress(128), 1);
});

test("canvas frame renderer paints the supplied local background, tree cards, and text", () => {
  const story = buildRemotionStory({ people, selectedPersonId: "child-a" });
  const context = fakeCanvasContext();
  const image = { width: 1600, height: 900 };
  const canvas = { width: 1280, height: 720, getContext: () => context };
  const renderFrame = createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: image });

  renderFrame(story.timeline.shots[0].startFrame);

  assert.ok(context.calls.some(call => call[0] === "image" && call[1] === image));
  assert.ok(context.calls.some(call => call[0] === "curve"));
  assert.ok(context.calls.some(call => call[0] === "arc"));
  assert.ok(context.calls.some(call => call[0] === "text" && String(call[1]).includes("WAYDEAN")));
  assert.ok(context.calls.some(call => call[0] === "text" && String(call[1]).includes("СЕМЕЙНОЕ ДРЕВО")));
  assert.ok(context.calls.some(call => call[0] === "text" && String(call[1]).includes("3 человека")));
  assert.ok(context.calls.every(call => call[0] !== "text" || !String(call[1]).includes("ХОТИ")));
});

test("full-tree video uses aligned family rails while my-path keeps its curved connectors", () => {
  const renderScope = scopeType => {
    const story = buildRemotionStory({ people, selectedPersonId: "child-a", scopeType });
    const shot = story.timeline.shots[0];
    const frame = shot.startFrame + Math.floor(shot.durationFrames * 0.8);
    const context = fakeCanvasContext();
    const canvas = { width: 1280, height: 720, getContext: () => context };
    createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(frame);
    return { story, frame, context };
  };
  const fullTree = renderScope("all");
  const myPath = renderScope("path");
  const edge = fullTree.story.timeline.layout.edges.find(item => item.childId === "child-a");
  const parent = fullTree.story.timeline.layout.nodes.find(node => node.id === edge.parentId);
  const child = fullTree.story.timeline.layout.nodes.find(node => node.id === edge.childId);
  const framing = getCinematicFramingForFrame(fullTree.story, 1280, 720, fullTree.frame);
  const outputScale = Math.min(1280 / framing.viewWidth, 720 / framing.viewHeight);
  const markerRadius = browserCanvasRenderer.getOverviewMarkerRadius(framing.scale, outputScale);
  const markerHalfHeight = browserCanvasRenderer.getOverviewCardHalfHeight(markerRadius);
  const parentDetail = getVideoCardDetailProgress(parent.width * framing.scale * outputScale);
  const childDetail = getVideoCardDetailProgress(child.width * framing.scale * outputScale);
  const startY = parent.y + markerHalfHeight + (parent.height / 2 - markerHalfHeight) * parentDetail;
  const endY = child.y - (markerHalfHeight + (child.height / 2 - markerHalfHeight) * childDetail);
  const junctionY = startY + (endY - startY) * 0.5;
  const hasSegment = (context, fromX, fromY, toX, toY) => context.calls.some((call, index) =>
    call[0] === "move" && call[1] === fromX && call[2] === fromY &&
    context.calls[index + 1]?.[0] === "line" &&
    context.calls[index + 1]?.[1] === toX && context.calls[index + 1]?.[2] === toY
  );
  assert.ok(hasSegment(fullTree.context, parent.x, startY, parent.x, junctionY));
  assert.ok(hasSegment(fullTree.context, child.x, junctionY, child.x, endY));

  const pathEdge = myPath.story.timeline.layout.edges[0];
  const pathParent = myPath.story.timeline.layout.nodes.find(node => node.id === pathEdge.parentId);
  const pathChild = myPath.story.timeline.layout.nodes.find(node => node.id === pathEdge.childId);
  const pathSample = sampleRemotionFrame(myPath.story, myPath.frame);
  const pathFraming = getCinematicFramingForFrame(myPath.story, 1280, 720, myPath.frame);
  const pathOverview = pathSample.camera.zoom < 0.5 || pathFraming.scale < 0.5;
  const pathRadius = pathOverview ? Math.min(Math.max(5 / pathFraming.scale, 8), 64) : 8;
  const pathStartY = pathParent.y + (pathOverview ? pathRadius : pathParent.height / 2 - 2);
  const pathEndY = pathChild.y - (pathOverview ? pathRadius : pathChild.height / 2 - 2);
  const bend = Math.max(18, (pathEndY - pathStartY) * 0.56);
  assert.ok(myPath.context.calls.some(call => call[0] === "curve" &&
    call[1] === pathParent.x && call[2] === pathStartY + bend &&
    call[3] === pathChild.x && call[4] === pathEndY - bend &&
    call[5] === pathChild.x && call[6] === pathEndY
  ));
});

test("canvas generation caption falls back to known birth years when a clip has no caption", () => {
  const datedPeople = [
    { id: "root", name: "Отец", generation: 1, parent: null, born: 1972, died: null },
    { id: "mansur", name: "Мансур", generation: 2, parent: "root", born: 1999, died: null },
    { id: "son", name: "Сын", generation: 3, parent: "mansur", born: 2026, died: null }
  ];
  const story = buildRemotionStory({ people: datedPeople, selectedPersonId: "son" });
  const generationShot = story.timeline.shots.find(shot => shot.type === "generation" && shot.generation === 2);
  const context = fakeCanvasContext();
  const canvas = { width: 1280, height: 720, getContext: () => context };

  generationShot.caption = "";
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(
    generationShot.startFrame + Math.floor(generationShot.durationFrames / 2)
  );

  assert.ok(context.calls.some(call => call[0] === "text" && String(call[1]) === "Известные годы: 1999"));
});

test("long person names stay whole and expand the card without overlapping siblings", () => {
  const longName = "Солт-Ахьмадвелимагомед";
  const family = [
    { id: "root", name: "Отец", generation: 1, parent: null, born: 1972, died: null },
    { id: "long", name: longName, generation: 2, parent: "root", born: null, died: null },
    { id: "short", name: "Сын", generation: 2, parent: "root", born: 2026, died: null }
  ];
  const story = buildRemotionStory({ people: family, selectedPersonId: "long" });
  const longNode = story.timeline.layout.nodes.find(node => node.id === "long");
  const shortNode = story.timeline.layout.nodes.find(node => node.id === "short");

  assert.ok(longNode.width > 176, "long names should receive a wider card");
  assert.ok(Math.abs(longNode.x - shortNode.x) >= (longNode.width + shortNode.width) / 2 + 48);

  const focusShot = story.timeline.shots.find(shot => shot.type === "focus");
  const context = fakeCanvasContext();
  const canvas = { width: 1280, height: 720, getContext: () => context };
  createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage: { width: 1600, height: 900 } })(
    focusShot.startFrame + Math.floor(focusShot.durationFrames * 0.8)
  );

  assert.ok(context.calls.some(call => call[0] === "text" && call[1] === longName));
});
