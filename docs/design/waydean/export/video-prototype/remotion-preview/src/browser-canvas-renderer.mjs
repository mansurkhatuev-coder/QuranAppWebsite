import {
  formatPersonDateLabel,
  getBackgroundScale,
  getCinematicFramingForFrame,
  getCinematicTitleFontSize,
  getCinematicTitleSafeZone,
  getChapterCopyStartFrame,
  getChapterCopyTransitionOpacities,
  getGenerationDateExcerpt,
  getFullTreeEdgeRevealProgress,
  getTreeViewportOpacity,
  getVideoCardDetailProgress,
  getVideoCardContentProgress,
  splitPersonName,
  getSceneEdgeEmphasis,
  getScenePersonEmphasis,
  getScenePresentation,
  sampleRemotionFrame
} from "./project-model.mjs?v=20261031-large-tree-path-camera-1";
import { REMOTION_COMPOSITION, VIDEO_FORMATS } from "./composition-config.mjs";
import { normalizeVideoSpeed } from "./export-studio-model.mjs?v=20261031-large-tree-path-camera-1";
import { easeCinematic } from "../../cinematic-timeline.mjs?v=20261031-large-tree-path-camera-1";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function buildBrowserRenderPlan(story, aspectRatio, maxDimension = 720, fps = 24, requestedSpeed = 1) {
  const format = VIDEO_FORMATS[aspectRatio] ?? VIDEO_FORMATS["16:9"];
  const scale = Math.min(1, Math.max(360, Number(maxDimension) || 720) / Math.min(format.width, format.height));
  const width = Math.max(2, Math.floor(format.width * scale / 2) * 2);
  const height = Math.max(2, Math.floor(format.height * scale / 2) * 2);
  const sourceFps = Number(story?.timeline?.fps) || REMOTION_COMPOSITION.fps;
  const outputFps = Math.min(30, Math.max(1, Math.floor(Number(fps) || 24)));
  const sourceFrames = Math.max(1, Math.floor(Number(story?.timeline?.totalFrames) || 1));
  const speed = normalizeVideoSpeed(requestedSpeed);
  const durationSeconds = sourceFrames / sourceFps / speed;
  return {
    width, height, fps: outputFps, sourceFps, sourceFrames, durationSeconds, speed,
    totalFrames: Math.max(1, Math.round(durationSeconds * outputFps))
  };
}

export function getSourceFrameForBrowserExport(outputFrame, plan) {
  if (Number(outputFrame) >= plan.totalFrames - 1) return plan.sourceFrames - 1;
  return Math.min(plan.sourceFrames - 1, Math.floor(Math.max(0, Number(outputFrame) || 0) * plan.sourceFps * plan.speed / plan.fps));
}

function pathRoundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, r);
    return;
  }
  context.moveTo(x + r, y); context.lineTo(x + width - r, y); context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r); context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height); context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r); context.quadraticCurveTo(x, y, x + r, y); context.closePath();
}

function endpointDetail(value) {
  return typeof value === "boolean" ? (value ? 0 : 1) : clamp(value, 0, 1);
}

function edgeCurve(parent, child, parentDetail, childDetail, markerRadius) {
  const markerHalfHeight = getOverviewCardHalfHeight(markerRadius);
  const startY = parent.y + markerHalfHeight + (parent.height / 2 - 2 - markerHalfHeight) * endpointDetail(parentDetail);
  const endY = child.y - (markerHalfHeight + (child.height / 2 - 2 - markerHalfHeight) * endpointDetail(childDetail));
  const bend = Math.max(18, (endY - startY) * 0.56);
  return [parent.x, startY, parent.x, startY + bend, child.x, endY - bend, child.x, endY];
}

function edgePolyline(parent, child, parentDetail, childDetail, markerRadius) {
  const markerHalfHeight = getOverviewCardHalfHeight(markerRadius);
  const startY = parent.y + markerHalfHeight + (parent.height / 2 - markerHalfHeight) * endpointDetail(parentDetail);
  const endY = child.y - (markerHalfHeight + (child.height / 2 - markerHalfHeight) * endpointDetail(childDetail));
  const junctionY = startY + (endY - startY) * 0.5;
  return [parent.x, startY, parent.x, junctionY, child.x, junctionY, child.x, endY];
}

function drawPartialPolyline(context, points, progress) {
  context.beginPath();
  context.moveTo(points[0], points[1]);
  if (progress >= 0.999) {
    for (let index = 2; index < points.length; index += 2) {
      context.lineTo(points[index], points[index + 1]);
    }
    return null;
  }

  const segments = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 2; index += 2) {
    const from = { x: points[index], y: points[index + 1] };
    const to = { x: points[index + 2], y: points[index + 3] };
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length });
    totalLength += length;
  }

  let remaining = totalLength * clamp(progress, 0, 1);
  let endpoint = { x: points[0], y: points[1] };
  for (const segment of segments) {
    if (remaining >= segment.length) {
      endpoint = segment.to;
      remaining -= segment.length;
      context.lineTo(endpoint.x, endpoint.y);
      continue;
    }
    const amount = segment.length ? remaining / segment.length : 1;
    endpoint = {
      x: segment.from.x + (segment.to.x - segment.from.x) * amount,
      y: segment.from.y + (segment.to.y - segment.from.y) * amount
    };
    context.lineTo(endpoint.x, endpoint.y);
    break;
  }
  return endpoint;
}

function drawPartialCurve(context, p, progress) {
  context.beginPath(); context.moveTo(p[0], p[1]);
  if (progress >= 0.999) { context.bezierCurveTo(...p.slice(2)); return null; }
  const steps = Math.max(1, Math.ceil(32 * progress));
  let end = null;
  for (let i = 1; i <= steps; i += 1) {
    const t = progress * i / steps; const u = 1 - t;
    const x = u ** 3 * p[0] + 3 * u ** 2 * t * p[2] + 3 * u * t ** 2 * p[4] + t ** 3 * p[6];
    const y = u ** 3 * p[1] + 3 * u ** 2 * t * p[3] + 3 * u * t ** 2 * p[5] + t ** 3 * p[7];
    context.lineTo(x, y); end = { x, y };
  }
  return end;
}

function sceneCaption(shot, story) {
  if (shot.caption) return shot.caption;
  if (shot.type === "generation") {
    const generation = Number(shot.generation ?? shot.label.match(/\d+/)?.[0]);
    if (story.includeDates && Number.isFinite(generation)) return getGenerationDateExcerpt(story.people, generation);
    return `Поколение ${Number.isFinite(generation) ? generation : "рода"} · связь сохраняется`;
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

function peopleCountLabel(count) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  let word = "человек";
  if (remainder100 < 11 || remainder100 > 14) {
    if (remainder10 >= 2 && remainder10 <= 4) word = "человека";
  }
  return `${count} ${word}`;
}

function drawFamilyTreeConnectors(context, edges) {
  const groups = new Map();
  for (const edge of edges) {
    if (edge.visible <= 0) continue;
    const key = `${edge.parent.id}:${Math.round(edge.child.y)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        parent: edge.parent,
        startY: edge.points[1],
        junctionY: edge.points[3],
        leftX: edge.parent.x,
        rightX: edge.parent.x,
        baseAlpha: edge.baseAlpha,
        revealAlpha: edge.revealAlpha,
        revealProgress: edge.revealProgress,
        lineWidth: edge.lineWidth,
        edges: []
      };
      groups.set(key, group);
    }
    group.leftX = Math.min(group.leftX, edge.child.x);
    group.rightX = Math.max(group.rightX, edge.child.x);
    group.baseAlpha = Math.max(group.baseAlpha, edge.baseAlpha);
    group.revealAlpha = Math.max(group.revealAlpha, edge.revealAlpha);
    group.revealProgress = Math.max(group.revealProgress, edge.revealProgress);
    group.lineWidth = Math.max(group.lineWidth, edge.lineWidth);
    group.edges.push(edge);
  }

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#e3c982";
  for (const group of groups.values()) {
    const { parent, startY, junctionY, leftX, rightX, baseAlpha, revealAlpha, revealProgress, lineWidth, edges: connections } = group;
    context.globalAlpha = baseAlpha;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(parent.x, startY);
    context.lineTo(parent.x, junctionY);
    context.moveTo(leftX, junctionY);
    context.lineTo(rightX, junctionY);
    context.stroke();

    for (const edge of connections) {
      context.beginPath();
      context.moveTo(edge.child.x, junctionY);
      context.lineTo(edge.child.x, edge.points[7]);
      context.stroke();
    }

    if (revealProgress <= 0) continue;
    context.globalAlpha = revealAlpha;
    context.lineWidth = lineWidth * 1.15;
    const trunkProgress = clamp(revealProgress / 0.24, 0, 1);
    if (trunkProgress > 0) {
      drawPartialPolyline(context, [parent.x, startY, parent.x, junctionY], trunkProgress);
      context.stroke();
    }
    const spreadProgress = clamp((revealProgress - 0.16) / 0.5, 0, 1);
    if (spreadProgress > 0) {
      drawPartialPolyline(context, [parent.x, junctionY, leftX, junctionY], spreadProgress);
      context.stroke();
      drawPartialPolyline(context, [parent.x, junctionY, rightX, junctionY], spreadProgress);
      context.stroke();
    }
    const dropProgress = clamp((revealProgress - 0.6) / 0.4, 0, 1);
    if (dropProgress > 0) {
      for (const edge of connections) {
        drawPartialPolyline(context, [edge.child.x, junctionY, edge.child.x, edge.points[7]], dropProgress);
        context.stroke();
      }
    }
  }
  context.restore();
}

function drawBackground(context, image, width, height, scale) {
  const sourceWidth = Number(image?.displayWidth || image?.videoWidth || image?.naturalWidth || image?.width);
  const sourceHeight = Number(image?.displayHeight || image?.videoHeight || image?.naturalHeight || image?.height);
  if (!sourceWidth || !sourceHeight) { context.fillStyle = "#070b0c"; context.fillRect(0, 0, width, height); return; }
  const cover = Math.max(width / sourceWidth, height / sourceHeight) * scale;
  const imageWidth = sourceWidth * cover; const imageHeight = sourceHeight * cover;
  const movingVideoFrame = typeof image.draw === "function" || Number(image.videoWidth) > 0;
  context.save();
  if (!movingVideoFrame) context.filter = "brightness(0.66) saturate(0.78)";
  if (typeof image.draw === "function") {
    const cropWidth = width / cover; const cropHeight = height / cover;
    image.draw(context, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, width, height);
  } else {
    context.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
  }
  if (movingVideoFrame) {
    context.fillStyle = "rgba(3,7,8,0.34)";
    context.fillRect(0, 0, width, height);
  } else {
    context.filter = "none";
  }
  let gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(3,7,8,0.58)"); gradient.addColorStop(0.37, "rgba(4,8,8,0.13)"); gradient.addColorStop(1, "rgba(3,7,7,0.58)");
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(3,7,8,0.56)"); gradient.addColorStop(0.45, "rgba(3,7,8,0)"); gradient.addColorStop(1, "rgba(3,7,8,0.24)");
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(2,5,6,0)"); vignette.addColorStop(0.68, "rgba(2,5,6,0.16)"); vignette.addColorStop(1, "rgba(2,5,6,0.58)");
  context.fillStyle = vignette; context.fillRect(0, 0, width, height); context.restore();
}

function drawCard(context, person, node, alpha, isTarget, includeDates, contentAlpha = 1) {
  const x = node.x - node.width / 2; const y = node.y - node.height / 2; const avatarX = x + 30;
  const names = splitPersonName(person.name); const fontSize = person.name.length > 18 ? 13 : 17;
  context.save(); context.globalAlpha = clamp(alpha, 0, 1);
  if (isTarget) {
    context.shadowColor = "rgba(225,184,98,0.78)"; context.shadowBlur = 20; context.strokeStyle = "#ead29a"; context.lineWidth = 2;
    pathRoundRect(context, x - 4, y - 4, node.width + 8, node.height + 8, 16); context.stroke(); context.shadowBlur = 0;
  }
  context.fillStyle = "rgba(3,7,7,0.7)"; pathRoundRect(context, x + 2, y + 7, node.width, node.height, 12); context.fill();
  const card = context.createLinearGradient(x, y, x + node.width * 0.9, y + node.height);
  if (isTarget) { card.addColorStop(0, "rgba(68,55,33,0.98)"); card.addColorStop(0.48, "rgba(23,23,18,0.99)"); card.addColorStop(1, "rgba(11,13,11,0.99)"); }
  else { card.addColorStop(0, "rgba(32,39,36,0.98)"); card.addColorStop(0.56, "rgba(12,18,18,0.99)"); card.addColorStop(1, "rgba(8,12,13,0.99)"); }
  context.fillStyle = card; context.strokeStyle = isTarget ? "#ead29a" : "rgba(223,190,124,0.64)"; context.lineWidth = isTarget ? 1.8 : 1.4;
  pathRoundRect(context, x, y, node.width, node.height, 12); context.fill(); context.stroke();
  if (!isTarget) { context.strokeStyle = "rgba(255,238,197,0.17)"; context.lineWidth = 1; pathRoundRect(context, x + 5, y + 5, node.width - 10, node.height - 10, 8); context.stroke(); }
  if (contentAlpha > 0) {
    context.save(); context.globalAlpha = clamp(alpha * contentAlpha, 0, 1);
    context.beginPath(); context.arc(avatarX, node.y, 22, 0, Math.PI * 2); context.fillStyle = "rgba(215,185,119,0.09)"; context.strokeStyle = "rgba(228,197,129,0.55)"; context.lineWidth = 1.3; context.fill(); context.stroke();
    context.beginPath(); context.arc(avatarX, node.y - 7, 7, 0, Math.PI * 2); context.moveTo(avatarX - 16, node.y + 16);
    context.bezierCurveTo(avatarX - 15, node.y + 3, avatarX - 7, node.y + 2, avatarX, node.y + 2); context.bezierCurveTo(avatarX + 9, node.y + 2, avatarX + 15, node.y + 7, avatarX + 16, node.y + 16); context.closePath(); context.fillStyle = "#d7c9ac"; context.fill();
    context.textAlign = "left"; context.textBaseline = "alphabetic"; context.fillStyle = "#fff8e8"; context.font = `${isTarget ? 700 : 500} ${fontSize}px Georgia, 'Times New Roman', serif`;
    const textX = x + 67; const startY = node.y - ((names.length - 1) * 8); names.forEach((line, i) => context.fillText(line, textX, startY + i * 15, node.width - 75));
    const date = formatPersonDateLabel(person, includeDates);
    if (date) { context.fillStyle = "#d9c599"; context.font = "11px Arial, sans-serif"; context.fillText(date, textX, node.y + 34, node.width - 75); }
    context.textAlign = "right"; context.fillStyle = "#bda36e"; context.font = "9px Arial, sans-serif"; context.fillText(String(person.generation).padStart(2, "0"), x + node.width - 12, y + 15);
    context.restore();
  }
  context.restore();
}

function drawMarker(context, node, alpha, isTarget, radius) {
  const { width, height, cornerRadius } = getOverviewCardGeometry(radius);
  const left = node.x - width / 2;
  const top = node.y - height / 2;
  const worldPixel = radius / 4;
  context.save(); context.globalAlpha = clamp(alpha, 0, 1);
  if (isTarget) {
    const padding = worldPixel * 2.5;
    context.shadowColor = "rgba(255,222,147,0.8)"; context.shadowBlur = 10; context.strokeStyle = "#fff0c7";
    context.lineWidth = getOverviewMarkerWorldStrokeWidth(radius, 1.6);
    pathRoundRect(context, left - padding, top - padding, width + padding * 2, height + padding * 2, cornerRadius + padding);
    context.stroke(); context.shadowBlur = 0;
  }
  context.fillStyle = "#101817"; context.strokeStyle = isTarget ? "#f0d797" : "#d7c18c";
  context.lineWidth = getOverviewMarkerWorldStrokeWidth(radius, 1.4);
  pathRoundRect(context, left, top, width, height, cornerRadius); context.fill(); context.stroke();
  context.restore();
}

export function getOverviewMarkerRadius(framingScale, outputScale) {
  const totalScale = Number(framingScale) * Number(outputScale);
  if (!Number.isFinite(totalScale) || totalScale <= 0) return 4;
  return 4 / totalScale;
}

export function getOverviewMarkerWorldStrokeWidth(radius, screenWidth = 1.4) {
  const markerRadius = Number(radius);
  const desiredWidth = Number(screenWidth);
  if (!Number.isFinite(markerRadius) || markerRadius <= 0 || !Number.isFinite(desiredWidth) || desiredWidth <= 0) return 1.4;
  const totalScale = 4 / markerRadius;
  return desiredWidth / totalScale;
}

export function getOverviewCardGeometry(markerRadius) {
  const radius = Number.isFinite(Number(markerRadius)) && Number(markerRadius) > 0 ? Number(markerRadius) : 4;
  const height = radius * 1.4;
  return { width: radius * 2.6, height, cornerRadius: height * 0.22 };
}

export function getOverviewCardHalfHeight(markerRadius) {
  return getOverviewCardGeometry(markerRadius).height / 2;
}

export function getVideoCardRevealGeometry(node, detailProgress, markerRadius) {
  const marker = getOverviewCardGeometry(markerRadius);
  const progress = clamp(Number(detailProgress) || 0, 0, 1);
  const width = marker.width + (node.width - marker.width) * progress;
  const height = marker.height + (node.height - marker.height) * progress;
  return { width, height, scaleX: width / node.width, scaleY: height / node.height };
}

function drawAdaptiveCard(context, person, node, alpha, isTarget, includeDates, contentAlpha, geometry) {
  context.save();
  context.translate(node.x, node.y);
  context.scale(geometry.scaleX, geometry.scaleY);
  context.translate(-node.x, -node.y);
  drawCard(context, person, node, alpha, isTarget, includeDates, contentAlpha);
  context.restore();
}

function drawCopy(context, story, shot, shotIndex, frame, width, height) {
  const local = Math.max(0, frame - shot.startFrame); const copyStart = getChapterCopyStartFrame(shot);
  const intro = shotIndex === 0 ? easeCinematic(clamp(local / Math.max(1, Math.min(24, shot.durationFrames - 1)), 0, 1)) : 1;
  const transition = getChapterCopyTransitionOpacities(shotIndex === 0 ? 1 : clamp(local / Math.max(1, story.timeline.transitionFrames - 1), 0, 1));
  const delayed = shot.type === "focus" || shot.type === "finale";
  const titleAlpha = shotIndex === 0 || delayed ? easeCinematic(clamp((local - copyStart) / 20, 0, 1)) : transition.incoming;
  const captionAlpha = shotIndex === 0 || delayed ? easeCinematic(clamp((local - copyStart - 8) / 22, 0, 1)) : transition.incoming;
  const typeScale = Math.max(0.7, Math.min(1, width / REMOTION_COMPOSITION.width)); const inset = Math.round(width * 0.05625);
  const title = shot.title || story.title; const titleSize = getCinematicTitleFontSize((shot.type === "opening" || shot.type === "finale" ? 86 : 72) * typeScale, title, width - inset * 2);
  const safe = getCinematicTitleSafeZone(height, title.length);
  context.save(); let gradient = context.createLinearGradient(0, safe.top, 0, height);
  gradient.addColorStop(0, "rgba(4,8,8,0)"); gradient.addColorStop(0.35, "rgba(4,8,8,0.46)"); gradient.addColorStop(1, "rgba(4,8,8,0.84)"); context.fillStyle = gradient; context.fillRect(0, safe.top, width, safe.height);
  context.fillStyle = "#dec68f"; context.textAlign = "left"; context.font = `600 ${Math.max(12, 17 * typeScale)}px Arial, sans-serif`; context.globalAlpha = intro * 0.94; context.fillText("WAYDEAN · СЕМЕЙНОЕ ДРЕВО", inset, Math.round(height * 70 / 1080));
  context.textAlign = "right"; context.fillStyle = "rgba(255,246,225,0.72)"; context.font = `500 ${Math.max(12, 15 * typeScale)}px Arial, sans-serif`; context.globalAlpha = intro * 0.82; context.fillText(`${String(shotIndex + 1).padStart(2, "0")}  /  ${String(story.timeline.shots.length).padStart(2, "0")}`, width - inset, Math.round(height * 70 / 1080));
  context.textAlign = "left"; context.textBaseline = "alphabetic"; context.fillStyle = "#fff8e8"; context.font = `500 ${titleSize}px Georgia, 'Times New Roman', serif`; context.shadowColor = "rgba(0,0,0,0.82)"; context.shadowBlur = Math.max(8, width * 0.015); context.globalAlpha = titleAlpha; context.fillText(title, inset, height - Math.round(height * 252 / 1080), width - inset * 2);
  context.shadowBlur = Math.max(5, width * 0.009); context.fillStyle = "rgba(255,246,226,0.86)"; context.font = `${39 * typeScale}px Arial, sans-serif`; context.globalAlpha = captionAlpha; context.fillText(sceneCaption(shot, story), inset, height - Math.round(height * 170 / 1080), width - inset * 2);
  context.shadowBlur = 0; context.fillStyle = "rgba(239,218,173,0.68)"; context.textAlign = "right"; context.font = `600 ${Math.max(12, 15 * typeScale)}px Arial, sans-serif`; context.globalAlpha = intro * 0.86; context.fillText(`СЕМЕЙНАЯ ИСТОРИЯ · ${peopleCountLabel(story.people.length)}`, width - inset, height - Math.round(height * 66 / 1080));
  context.restore();
}

export function createBrowserCanvasFrameRenderer({ canvas, story, backgroundImage }) {
  const context = canvas?.getContext?.("2d", { alpha: false });
  if (!context) throw new Error("Не удалось создать холст для видео.");
  const nodes = new Map(story.timeline.layout.nodes.map(node => [node.id, node]));
  const people = new Map(story.people.map(person => [person.id, person]));
  const selectedLineagePersonIds = new Set(story.timeline.pathIds);
  const pathIndex = new Map(story.timeline.pathIds.slice(1).map((id, index) => [`${story.timeline.pathIds[index]}->${id}`, index]));
  const firstRevealShotByPerson = new Map();
  story.timeline.shots.forEach((shot, shotIndex) => {
    for (const personId of shot.personIds) {
      if (!firstRevealShotByPerson.has(personId)) firstRevealShotByPerson.set(personId, shotIndex);
    }
  });

  return (frame, videoBackgroundFrame = null) => {
    const globalFrame = clamp(Math.floor(Number(frame) || 0), 0, story.timeline.totalFrames - 1);
    const sample = sampleRemotionFrame(story, globalFrame); if (!sample) return;
    const shotIndex = sample.shotIndex; const shot = story.timeline.shots[shotIndex]; const local = Math.max(0, globalFrame - shot.startFrame);
    const framing = getCinematicFramingForFrame(story, canvas.width, canvas.height, globalFrame); if (!framing) return;
    drawBackground(context, videoBackgroundFrame ?? backgroundImage, canvas.width, canvas.height, getBackgroundScale(sample.frame, story.timeline.totalFrames));
    const overview = sample.camera.zoom < 0.5 || framing.scale < 0.5;
    const presentation = getScenePresentation(shot.type); const scale = Math.min(canvas.width / framing.viewWidth, canvas.height / framing.viewHeight);
    const overviewMarkerRadius = getOverviewMarkerRadius(framing.scale, scale);
    const markerRadius = overview ? overviewMarkerRadius : 8;
    const fullTreeCardDetailProgress = story.scopeType === "all"
      ? getVideoCardDetailProgress(story.timeline.layout.cardWidth * framing.scale * scale)
      : null;
    const fullTreeReferenceGeometry = story.scopeType === "all"
      ? getVideoCardRevealGeometry({
        width: story.timeline.layout.cardWidth,
        height: story.timeline.layout.cardHeight
      }, fullTreeCardDetailProgress, overviewMarkerRadius)
      : null;
    const fullTreeContentProgress = fullTreeReferenceGeometry
      ? getVideoCardContentProgress(fullTreeReferenceGeometry.width * framing.scale * scale)
      : null;
    const isRevealedSelectedLineagePerson = person => selectedLineagePersonIds.has(person.id)
      && (firstRevealShotByPerson.get(person.id) ?? Infinity) <= shotIndex;
    const getPersonDetailProgress = person => getVideoCardDetailProgress(
      story.timeline.layout.cardWidth * framing.scale * scale,
      isRevealedSelectedLineagePerson(person)
    );
    const offsetX = (canvas.width - framing.viewWidth * scale) / 2; const offsetY = (canvas.height - framing.viewHeight * scale) / 2;
    context.save(); context.translate(offsetX + framing.translateX * scale, offsetY + framing.translateY * scale); context.scale(framing.scale * scale, framing.scale * scale);
    const orthogonalTree = story.scopeType === "all";
    const edgeStates = story.timeline.layout.edges.flatMap(edge => {
      const parent = nodes.get(edge.parentId); const child = nodes.get(edge.childId);
      if (!parent || !child) return [];
      const index = pathIndex.get(edge.key);
      const isPath = index != null;
      const progress = isPath ? clamp(sample.lineProgress - index, 0, 1) : 1;
      const emphasis = getSceneEdgeEmphasis(story, shotIndex, local, edge.key);
      const parentIsMarker = overview && (firstRevealShotByPerson.get(parent.id) ?? Infinity) > shotIndex;
      const childIsMarker = overview && (firstRevealShotByPerson.get(child.id) ?? Infinity) > shotIndex;
      const parentDetail = story.scopeType === "all"
        ? getPersonDetailProgress(parent)
        : parentIsMarker ? 0 : 1;
      const childDetail = story.scopeType === "all"
        ? getPersonDetailProgress(child)
        : childIsMarker ? 0 : 1;
      const generationProgress = story.scopeType === "all"
        ? getFullTreeEdgeRevealProgress(story, shotIndex, local, edge.key)
        : 0;
      const base = story.scopeType === "all" ? 0.22 : shot.type === "opening" || shot.type === "finale" ? 0.24 : 0.08;
      const visible = getTreeViewportOpacity(story.scopeType, 1);
      return [{
        key: edge.key,
        parent,
        child,
        isPath,
        progress,
        generationProgress,
        emphasis,
        visible,
        alpha: (base + emphasis * (0.9 - base)) * visible,
        baseAlpha: base * visible,
        revealAlpha: 0.68 * visible,
        revealProgress: generationProgress,
        lineWidth: (1.8 + emphasis * 2.4) / (framing.scale * scale),
        points: orthogonalTree
          ? edgePolyline(parent, child, parentDetail, childDetail, overviewMarkerRadius)
          : edgeCurve(parent, child, parentDetail, childDetail, markerRadius)
      }];
    });

    if (orthogonalTree) {
      drawFamilyTreeConnectors(context, edgeStates);
    } else {
      for (const edge of edgeStates) {
        context.globalAlpha = edge.alpha;
        context.strokeStyle = "#e3c982";
        context.lineWidth = edge.lineWidth;
        context.beginPath();
        context.moveTo(edge.points[0], edge.points[1]);
        context.bezierCurveTo(...edge.points.slice(2));
        context.stroke();
      }
    }

    for (const edge of edgeStates) {
      const { parent, child, isPath, progress, visible, points } = edge;
      if (story.scopeType !== "all" && isPath && progress > 0) {
        const endpoint = orthogonalTree
          ? drawPartialPolyline(context, points, progress)
          : drawPartialCurve(context, points, progress);
        const gold = context.createLinearGradient(parent.x, parent.y, child.x, child.y);
        gold.addColorStop(0, "#fff0c7"); gold.addColorStop(0.44, "#e2bd70"); gold.addColorStop(1, "#a97636");
        context.globalAlpha = (progress < 1 ? 0.9 : 0.12) * visible; context.strokeStyle = gold; context.lineWidth = (progress < 1 ? 4.2 : 1.8) / (framing.scale * scale);
        context.shadowColor = progress < 1 ? "rgba(226,189,112,0.84)" : "transparent"; context.shadowBlur = progress < 1 ? 11 / (framing.scale * scale) : 0; context.stroke(); context.shadowBlur = 0;
        if (endpoint) { context.beginPath(); context.arc(endpoint.x, endpoint.y, 2.3 / (framing.scale * scale), 0, Math.PI * 2); context.fillStyle = "#fff0c7"; context.globalAlpha = 0.92 * visible; context.fill(); }
      }
    }
    for (const node of story.timeline.layout.nodes) {
      const person = people.get(node.id); if (!person) continue;
      const emphasis = getScenePersonEmphasis(story, shotIndex, local, person.id); const target = person.id === story.selectedPersonId && (shot.type === "focus" || shot.type === "finale");
      const isUnrevealedOverviewMarker = overview
        && (firstRevealShotByPerson.get(person.id) ?? Infinity) > shotIndex;
      const cardAlpha = story.scopeType === "all"
        ? 1
        : presentation.contextCardOpacity + (1 - presentation.contextCardOpacity) * emphasis;
      const opacity = getTreeViewportOpacity(story.scopeType, cardAlpha);
      if (story.scopeType === "all") {
        const detailProgress = getPersonDetailProgress(node);
        const geometry = getVideoCardRevealGeometry(node, detailProgress, overviewMarkerRadius);
        const contentProgress = isRevealedSelectedLineagePerson(person)
          ? getVideoCardContentProgress(geometry.width * framing.scale * scale)
          : fullTreeContentProgress;
        drawAdaptiveCard(context, person, node, opacity, target, story.includeDates, contentProgress, geometry);
        continue;
      }
      if (isUnrevealedOverviewMarker) drawMarker(context, node, opacity, target, markerRadius);
      else {
        const contentProgress = getVideoCardContentProgress(node.width * framing.scale * scale);
        drawCard(context, person, node, opacity, target, story.includeDates, contentProgress);
      }
    }
    context.restore(); drawCopy(context, story, shot, shotIndex, globalFrame, canvas.width, canvas.height);
  };
}
