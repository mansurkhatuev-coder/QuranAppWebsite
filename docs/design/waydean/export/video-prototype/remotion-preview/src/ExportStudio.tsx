import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { VIDEO_FORMATS } from "./composition-config.mjs";
import { FamilyHistoryVideo } from "./Composition";
import {
  DEFAULT_EXPORT_SETTINGS,
  EXPORT_SETTINGS_STORAGE_KEY,
  buildExportPreview,
  normalizeExportSettings
} from "./export-studio-model.mjs";
import type { ExportSettings } from "./export-studio-model.mjs";
import { HOTI_PEOPLE } from "../../hoti-people.mjs";
import type { FamilyHistoryProps } from "./Composition";
import { buildSceneThumbnail } from "../../scene-thumbnail-model.mjs";
import type { PersonRecord, StoryModel, StoryShot } from "./project-model.mjs";
import type { PublicRenderJob } from "./render-job-model.mjs";
import { LOCAL_RENDER_SCALE } from "./render-job-model.mjs";
import { summarizeSuccessfulRenderPoll } from "./render-job-poll.mjs";

function loadSettings(): ExportSettings {
  let storedSettings: Partial<ExportSettings> = {};
  try {
    const serialized = window.localStorage.getItem(EXPORT_SETTINGS_STORAGE_KEY);
    if (serialized) storedSettings = JSON.parse(serialized) as Partial<ExportSettings>;
  } catch {
    // A malformed local preference must not prevent the studio from opening.
  }

  const params = new URLSearchParams(window.location.search);
  const scope = params.get("scope");
  const personId = params.get("person");
  const knownPersonId = HOTI_PEOPLE.find(person => person.id === personId)?.id;
  return normalizeExportSettings({
    ...storedSettings,
    ...(scope === "all" || scope === "path" || scope === "branch" ? { scopeType: scope } : {}),
    ...(knownPersonId ? { selectedPersonId: knownPersonId } : {})
  });
}

function getTreeReturnUrl() {
  const fallback = "http://127.0.0.1:8784/drewo/waydean-preview.html?state=all-tree";
  try {
    const target = new URL(new URLSearchParams(window.location.search).get("returnTo") || fallback);
    const port = Number(target.port);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname)
      || port < 8784 || port > 8800
      || target.pathname !== "/drewo/waydean-preview.html"
    ) return fallback;
    return target.href;
  } catch {
    return fallback;
  }
}

function getActiveShotIndex(shots: StoryShot[], frame: number) {
  const index = shots.findIndex(
    shot => frame >= shot.startFrame && frame < shot.startFrame + shot.durationFrames
  );
  return Math.max(0, index);
}

function formatDuration(seconds: number) {
  const rounded = Math.round(seconds);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

function personOption(person: PersonRecord) {
  const dates = person.born == null
    ? "даты неизвестны"
    : `${person.born} — ${person.died ?? "?"}`;
  return `${person.name} · поколение ${person.generation} · ${dates}`;
}

function SceneThumbnail({ story, shot }: { story: StoryModel; shot: StoryShot }) {
  const thumbnail = useMemo(() => buildSceneThumbnail(story, shot), [story, shot]);
  const nodesById = new Map(thumbnail.nodes.map(node => [node.id, node]));

  return (
    <span className="scene-thumbnail" aria-hidden="true">
      <svg viewBox={`0 0 ${thumbnail.width} ${thumbnail.height}`} preserveAspectRatio="none">
        {thumbnail.edges.map(edge => {
          const parent = nodesById.get(edge.parentId);
          const child = nodesById.get(edge.childId);
          if (!parent || !child) return null;
          const bendY = (parent.y + child.y) / 2;
          return (
            <path
              key={edge.key}
              d={`M ${parent.x} ${parent.y} C ${parent.x} ${bendY}, ${child.x} ${bendY}, ${child.x} ${child.y}`}
              fill="none"
              stroke={edge.active ? "#e4c37b" : "#c3a96f"}
              strokeWidth={edge.active ? 1.15 : 0.7}
              opacity={thumbnail.overview ? 0.23 : edge.active ? 0.86 : 0.24}
            />
          );
        })}
        {thumbnail.nodes.map(node => node.focus ? (
          <g key={node.id}>
            <rect x={node.x - 5.2} y={node.y - 3.4} width="10.4" height="6.8" rx="1.5" fill="#dcb66a" fillOpacity="0.92" />
            <circle cx={node.x} cy={node.y - 0.3} r="1.4" fill="#fff1ca" fillOpacity="0.9" />
          </g>
        ) : (
          <circle key={node.id} cx={node.x} cy={node.y} r={thumbnail.overview ? 0.9 : 1.7} fill="#d8d0b8" fillOpacity={thumbnail.overview ? 0.76 : 0.62} />
        ))}
      </svg>
    </span>
  );
}

function ExportStudio() {
  const [settings, setSettings] = useState<ExportSettings>(loadSettings);
  const preview = useMemo(() => buildExportPreview(settings), [settings]);
  const [activeShotIndex, setActiveShotIndex] = useState(0);
  const [saveLabel, setSaveLabel] = useState("Локальные настройки");
  const [renderJobs, setRenderJobs] = useState<PublicRenderJob[]>([]);
  const [renderJobsLoaded, setRenderJobsLoaded] = useState(false);
  const [downloadCheckId, setDownloadCheckId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState("");
  const [renderStarting, setRenderStarting] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const activeSceneRef = useRef<HTMLButtonElement>(null);
  const downloadCheckIdRef = useRef<string | null>(null);
  const downloadCheckTimeoutRef = useRef(0);
  const activeShot = preview.story.timeline.shots[activeShotIndex];
  const renderPollingNeeded = !renderJobsLoaded
    || Boolean(downloadCheckId)
    || renderJobs.some(job => ["queued", "bundling", "rendering", "cancelling"].includes(job.status));

  useEffect(() => () => window.clearTimeout(downloadCheckTimeoutRef.current), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        setSaveLabel("Сохранено в этом браузере");
      } catch {
        setSaveLabel("Настройки доступны до закрытия вкладки");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;

    const updateActiveShot = ({ detail }: { detail: { frame: number } }) => {
      const nextIndex = getActiveShotIndex(preview.story.timeline.shots, detail.frame);
      setActiveShotIndex(current => current === nextIndex ? current : nextIndex);
    };
    player.addEventListener("timeupdate", updateActiveShot);
    return () => player.removeEventListener("timeupdate", updateActiveShot);
  }, [preview.story.timeline.shots]);

  useEffect(() => {
    playerRef.current?.seekTo(0);
    setActiveShotIndex(0);
  }, [settings.scopeType, settings.selectedPersonId, settings.includeDates, settings.aspectRatio]);

  useEffect(() => {
    activeSceneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeShotIndex]);

  useEffect(() => {
    if (!renderPollingNeeded) return undefined;
    let cancelled = false;
    let timeoutId = 0;
    const refresh = async () => {
      try {
        const response = await fetch("/api/render", { cache: "no-store" });
        if (!response.ok) throw new Error("Render list unavailable");
        const jobs = await response.json() as PublicRenderJob[];
        const poll = summarizeSuccessfulRenderPoll(jobs, {
          checkingDownloadId: downloadCheckIdRef.current
        });
        if (!cancelled) {
          setRenderJobs(poll.jobs);
          setRenderJobsLoaded(true);
          setRenderError(poll.error);
          if (downloadCheckIdRef.current && !poll.checkingDownload) {
            downloadCheckIdRef.current = null;
            setDownloadCheckId(null);
            window.clearTimeout(downloadCheckTimeoutRef.current);
          }
        }
        if (!cancelled && poll.shouldContinue) {
          timeoutId = window.setTimeout(refresh, 900);
        }
      } catch {
        if (!cancelled) {
          setRenderError("Не удалось получить состояние локального экспорта.");
          if (renderPollingNeeded) timeoutId = window.setTimeout(refresh, 900);
        }
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [renderPollingNeeded]);

  const updateSettings = (patch: Partial<ExportSettings>) => {
    setSettings(current => normalizeExportSettings({ ...current, ...patch }));
  };

  const resetSettings = () => {
    try {
      window.localStorage.removeItem(EXPORT_SETTINGS_STORAGE_KEY);
    } catch {
      // Private browsing may disable local storage.
    }
    setSettings(DEFAULT_EXPORT_SETTINGS);
    setSaveLabel("Настройки сброшены");
  };

  const startLocalRender = async () => {
    setRenderStarting(true);
    setRenderError("");
    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const result = await response.json() as PublicRenderJob & { error?: string };
      if (!response.ok) throw new Error(result.error || "Локальный рендер недоступен");
      setRenderJobs(current => [...current.filter(job => job.id !== result.id), result]);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "Локальный рендер недоступен.");
    } finally {
      setRenderStarting(false);
    }
  };

  const performJobAction = async (job: PublicRenderJob, action: "cancel" | "retry") => {
    setRenderError("");
    try {
      const response = await fetch(action === "cancel" ? `/api/render/${job.id}` : `/api/render/${job.id}/retry`, {
        method: action === "cancel" ? "DELETE" : "POST"
      });
      const result = await response.json() as PublicRenderJob & { error?: string };
      if (!response.ok) throw new Error(result.error || "Действие с экспортом недоступно");
      setRenderJobs(current => [...current.filter(item => item.id !== result.id), result]);
      if (action === "retry") setRenderError("");
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "Действие с экспортом недоступно.");
    }
  };

  const beginDownloadCheck = (jobId: string) => {
    downloadCheckIdRef.current = jobId;
    setDownloadCheckId(jobId);
    window.clearTimeout(downloadCheckTimeoutRef.current);
    downloadCheckTimeoutRef.current = window.setTimeout(() => {
      downloadCheckIdRef.current = null;
      setDownloadCheckId(null);
    }, 12_000);
  };

  const selectShot = (shot: StoryShot, index: number) => {
    const settledFrame = Math.min(
      shot.startFrame + preview.story.timeline.transitionFrames - 1,
      shot.startFrame + shot.durationFrames - 1
    );
    playerRef.current?.seekTo(settledFrame);
    setActiveShotIndex(index);
  };

  const scopeName = settings.scopeType === "all"
    ? "Всё дерево"
    : settings.scopeType === "path"
      ? "Мой путь"
      : "Моя ветвь";
  const treeReturnUrl = getTreeReturnUrl();

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <a className="brand" href={treeReturnUrl} aria-label="Вернуться к семейному древу">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 35V14m0 10-8-6m8 11 8-7m-8-10 7-5m-7 3-5-6M9 17c-3-3 0-8 5-7 1-5 8-6 10-2 5-3 11 1 9 6 4 4 1 9-4 9M7 28c-4-2-3-8 2-9m17 15c6 2 11-2 10-7" />
          </svg>
          <span><strong>WAYDEAN</strong><small>СЕМЕЙНОЕ ДРЕВО</small></span>
        </a>
        <div className="header-path"><span>ВИДЕО</span><b>/</b><strong>История рода</strong></div>
        <a className="local-indicator return-to-tree" href={treeReturnUrl}><span aria-hidden="true">←</span> К ДРЕВУ</a>
      </header>

      <main>
        <section className="studio-intro">
          <div>
            <span className="eyebrow"><i /> ШАБЛОН 01 · WAYDEAN ORIGINALS</span>
            <h1>История, которую<br className="desktop-break" /> можно увидеть.</h1>
            <p>Соберите семейный рассказ из поколений, важных связей и выбранных людей.</p>
          </div>
          <div className="intro-mark" aria-hidden="true"><span>01</span><i /></div>
        </section>

        <section className="export-workspace" aria-label="Настройка видеоистории">
          <div className="preview-column">
            <div className="column-heading">
              <div><span className="eyebrow">ЖИВОЙ ПРОСМОТР</span><h2>Кадр будущей истории</h2></div>
              <span className="preview-status"><i /> REMOTION PLAYER</span>
            </div>

            <div className="player-frame" data-aspect-ratio={preview.frame.aspectRatio}>
              <Player
                ref={playerRef}
                component={FamilyHistoryVideo}
                inputProps={preview.settings as FamilyHistoryProps}
                durationInFrames={preview.durationFrames}
                compositionWidth={preview.frame.width}
                compositionHeight={preview.frame.height}
                fps={preview.fps}
                controls
                clickToPlay
                doubleClickToFullscreen
                showVolumeControls={false}
                spaceKeyToPlayOrPause
                acknowledgeRemotionLicense
                style={{
                  width: "100%",
                  aspectRatio: `${preview.frame.width} / ${preview.frame.height}`
                }}
              />
              <span className="frame-corner frame-corner-top" aria-hidden="true" />
              <span className="frame-corner frame-corner-bottom" aria-hidden="true" />
            </div>

            <div className="preview-meta" aria-live="polite">
              <div><span>ОБЛАСТЬ</span><strong>{scopeName}</strong></div>
              <div><span>ДЛИТЕЛЬНОСТЬ</span><strong>{formatDuration(preview.durationSeconds)}</strong></div>
              <div><span>СЦЕНЫ</span><strong>{preview.sceneCount}</strong></div>
              <div><span>ЧАСТОТА</span><strong>{preview.fps} FPS</strong></div>
            </div>

            <section className="scene-section" aria-label="Сцены видеоистории">
              <div className="scene-heading"><div><span className="eyebrow">РАССКАЗ ПО КАДРАМ</span><h3>{activeShot?.label ?? "Сцены истории"}</h3></div><span>{String(activeShotIndex + 1).padStart(2, "0")} <i>/</i> {String(preview.sceneCount).padStart(2, "0")}</span></div>
              <div className="scene-rail" role="list">
                {preview.story.timeline.shots.map((shot, index) => (
                  <button
                    className="scene-chip"
                    type="button"
                    key={shot.id}
                    ref={index === activeShotIndex ? activeSceneRef : undefined}
                    aria-current={index === activeShotIndex ? "step" : undefined}
                    onClick={() => selectShot(shot, index)}
                    title={`Перейти к сцене «${shot.label}»`}
                  >
                    <span className="scene-chip-topline"><span>{String(index + 1).padStart(2, "0")}</span><small>{formatDuration(shot.durationFrames / preview.fps)}</small></span>
                    <SceneThumbnail story={preview.story} shot={shot} />
                    <span className="scene-chip-copy"><strong>{shot.label}</strong><small>{shot.type === "opening" || shot.type === "finale"
                      ? `${preview.peopleCount} человек · ${shot.type === "opening" ? "обзор" : "финальный план"}`
                      : shot.personIds.map(id => preview.story.people.find(person => person.id === id)?.name).filter(Boolean).slice(0, 2).join(" · ")
                        + (shot.personIds.length > 2 ? ` +${shot.personIds.length - 2}` : "")}</small></span>
                    <span className="scene-chip-progress"><i style={{ "--scene-weight": `${Math.max(18, Math.min(100, Math.round(shot.durationFrames / preview.durationFrames * 100 * 4)))}%` } as CSSProperties} /></span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="settings-panel">
            <div className="settings-topline"><span>КОНСТРУКТОР ИСТОРИИ</span><span className="step-number">01</span></div>
            <h2>Настройте рассказ</h2>
            <p className="panel-lede">Сцены и движение перестроятся под ваш выбор.</p>

            <div className="template-card" aria-label="Выбранный шаблон">
              <div className="template-art" aria-hidden="true"><span>W</span><i /><b /></div>
              <div><span>ШАБЛОН</span><strong>История рода</strong><small>От истоков к потомкам</small></div>
              <span className="template-check" aria-label="Выбран">✓</span>
            </div>

            <label className="field-label" htmlFor="storyTitle">Название истории</label>
            <input
              id="storyTitle"
              className="text-control"
              type="text"
              value={settings.title}
              maxLength={80}
              onChange={event => updateSettings({ title: event.currentTarget.value })}
            />

            <label className="field-label" htmlFor="scopeType">Что показать</label>
            <select id="scopeType" className="select-control" value={settings.scopeType} onChange={event => updateSettings({ scopeType: event.currentTarget.value as ExportSettings["scopeType"] })}>
              <option value="all">Всё дерево</option>
              <option value="path">Мой путь · от предка ко мне</option>
              <option value="branch">Моя ветвь · потомки выбранного</option>
            </select>

            <label className="field-label" htmlFor="selectedPerson">Человек в центре истории</label>
            <select id="selectedPerson" className="select-control" value={settings.selectedPersonId} onChange={event => updateSettings({ selectedPersonId: event.currentTarget.value })}>
              {HOTI_PEOPLE.map(person => <option key={person.id} value={person.id}>{personOption(person)}</option>)}
            </select>

            <label className="toggle-row" htmlFor="includeDates">
              <span><strong>Показывать даты жизни</strong><small>Неуказанные даты останутся неизвестными</small></span>
              <input id="includeDates" type="checkbox" checked={settings.includeDates} onChange={event => updateSettings({ includeDates: event.currentTarget.checked })} />
              <i aria-hidden="true" />
            </label>

            <div className="rule" />
            <div className="output-heading"><div><span className="eyebrow">ФОРМАТ КАДРА</span><strong>Кандидат на экспорт</strong></div><span className="format-tag">{preview.frame.aspectRatio}</span></div>
            <div className="format-options" role="group" aria-label="Формат видео">
              {Object.entries(VIDEO_FORMATS).map(([aspectRatio, format]) => (
                <button
                  className="format-option"
                  type="button"
                  key={aspectRatio}
                  aria-pressed={settings.aspectRatio === aspectRatio}
                  onClick={() => updateSettings({ aspectRatio: aspectRatio as ExportSettings["aspectRatio"] })}
                >
                  <span>{aspectRatio}</span>
                  <small>{format.label}</small>
                </button>
              ))}
            </div>
            <div className="output-specs"><span>{preview.frame.width} × {preview.frame.height}</span><span>{preview.fps} кадров/с</span><span>{formatDuration(preview.durationSeconds)}</span></div>
            <p className="candidate-note"><i aria-hidden="true">i</i><span>Направление 1080p-кандидата утверждено; полные MP4 ещё проходят визуальную проверку.</span></p>

            <div className="render-panel">
              <button type="button" className="render-button" onClick={startLocalRender} disabled={renderStarting}>
                {renderStarting ? "Добавляем в очередь…" : "Добавить MP4 в очередь"}
              </button>
              <p className="render-local-note">Этот быстрый локальный MP4 выводится в {Math.round(preview.frame.width * LOCAL_RENDER_SCALE)} × {Math.round(preview.frame.height * LOCAL_RENDER_SCALE)}. Полные 1080p мастер-кандидаты формируются отдельно; production не используется.</p>
              {renderJobs.length ? <div className="render-job-list" aria-label="Задания локального экспорта">
                {renderJobs.map(job => (
                  <div className="render-status" aria-live="polite" key={job.id}>
                    <div className="render-status-copy">
                      <strong>{job.status === "completed" ? "Видео готово" : job.status === "failed" ? "Экспорт не завершён" : job.status === "cancelled" ? "Экспорт отменён" : job.stage}</strong>
                      <span>{job.status === "queued" ? `В очереди${job.queuePosition ? ` · №${job.queuePosition}` : ""}` : `${job.progress}%`}</span>
                    </div>
                    {!(["failed", "cancelled"].includes(job.status)) ? <div className="render-progress" role="progressbar" aria-label="Прогресс локального рендера" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}><i style={{ width: `${job.progress}%` }} /></div> : null}
                    {job.error ? <p className="render-error">{job.error}</p> : null}
                    {job.downloadUrl ? <a className="render-download" href={job.downloadUrl} onClick={() => beginDownloadCheck(job.id)}>Скачать локальный MP4 <span aria-hidden="true">↗</span></a> : null}
                    <div className="render-job-actions">
                      {job.actions.cancel ? <button type="button" onClick={() => void performJobAction(job, "cancel")}>Отменить</button> : null}
                      {job.actions.retry ? <button type="button" onClick={() => void performJobAction(job, "retry")}>Повторить</button> : null}
                    </div>
                  </div>
                ))}
              </div> : null}
              {renderError ? <p className="render-error" role="alert">{renderError}</p> : null}
            </div>

            <div className="panel-bottom">
              <div className="local-save"><i aria-hidden="true" /><span>{saveLabel}</span></div>
              <button type="button" className="reset-button" onClick={resetSettings}>Сбросить</button>
            </div>
          </aside>
        </section>

        <section className="story-summary" aria-label="Состав видеоистории">
          <div className="summary-heading"><span>ИСТОРИЯ В ЦИФРАХ</span><small>ЛОКАЛЬНОЕ ДРЕВО ХОТИ</small></div>
          <div className="summary-value"><strong>{preview.peopleCount}</strong><span>людей</span></div>
          <div className="summary-value"><strong>{preview.generationCount}</strong><span>поколений</span></div>
          <div className="summary-copy"><i /><p>Превью собрано по локальному снимку древа. Неуказанные даты и фото остаются неизвестными; production не меняется.</p></div>
        </section>
      </main>

      <footer className="studio-footer"><span>WAYDEAN · ИСТОРИЯ РОДА</span><span>{saveLabel.toLocaleUpperCase("ru-RU")} · ПРОДАКШН НЕ ПОДКЛЮЧЁН</span></footer>
    </div>
  );
}

const mount = document.getElementById("export-studio-root");
if (!mount) throw new Error("Export studio root is missing");
createRoot(mount).render(<ExportStudio />);
