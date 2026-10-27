import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRemotionStory,
  getCinematicFramingForFrame,
  sampleRemotionFrame
} from "./project-model.mjs";
import {
  buildBrowserRenderPlan,
  getSourceFrameForBrowserExport,
  createBrowserCanvasFrameRenderer
} from "./browser-canvas-renderer.mjs";

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
    beginPath: () => calls.push(["begin"]),
    moveTo: (...args) => calls.push(["move", ...args]),
    lineTo: (...args) => calls.push(["line", ...args]),
    bezierCurveTo: (...args) => calls.push(["curve", ...args]),
    quadraticCurveTo: (...args) => calls.push(["quadratic", ...args]),
    closePath: () => calls.push(["close"]),
    fill: () => calls.push(["fill"]),
    stroke: () => calls.push(["stroke"]),
    arc: (...args) => calls.push(["arc", ...args]),
    fillRect: (...args) => calls.push(["fill-rect", ...args]),
    drawImage: (...args) => calls.push(["image", ...args]),
    fillText: (...args) => calls.push(["text", ...args]),
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
  const sample = sampleRemotionFrame(fullTree.story, fullTree.frame);
  const framing = getCinematicFramingForFrame(fullTree.story, 1280, 720, fullTree.frame);
  const overview = sample.camera.zoom < 0.5 || framing.scale < 0.5;
  const markerRadius = overview ? Math.min(Math.max(5 / framing.scale, 8), 64) : 8;
  const startY = parent.y + (overview ? markerRadius : parent.height / 2);
  const endY = child.y - (overview ? markerRadius : child.height / 2);
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
