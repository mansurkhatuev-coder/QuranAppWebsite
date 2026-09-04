/** Create a new family-tree folder from the drewo-reklama template. */

export type RegistryOwnership = 'mine' | 'customer';

export type RegistryEntry = {
  treeDir: string;
  code: string;
  title: string;
  ownership: RegistryOwnership;
  note: string;
  createdAt: string;
};

export type RegistryFile = {
  version: number;
  trees: RegistryEntry[];
};

export const REGISTRY_PATH = 'trees/registry.json';
export const TEMPLATE_DIR = 'drewo-reklama';

export const LEGACY_TREE_DIRS = ['drewo', 'drewo-dada-yurt', 'drewo-reklama'] as const;

const RESERVED_DIRS = new Set([
  'drewo',
  'drewo-dada-yurt',
  'drewo-reklama',
  'trees',
  'admin',
  'data',
  'assets',
  'downloads',
  'scripts',
  'supabase',
  'qf-proxy',
  '.github',
]);

const TEMPLATE_ASSET_NAMES = [
  'apple-touch-icon.png',
  'bg.jpg',
  'bg-night.jpg',
  'bg-day-2.jpg',
  'bg-day-3.jpg',
  'icon-192.png',
  'icon-512.png',
];

export function defaultRegistry(): RegistryFile {
  return {
    version: 1,
    trees: [
      {
        treeDir: 'drewo',
        code: 'hoti',
        title: 'Хьоти некъ',
        ownership: 'mine',
        note: 'Семейное древо',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        treeDir: 'drewo-dada-yurt',
        code: 'dada',
        title: 'Дади-Юрт',
        ownership: 'mine',
        note: 'Родовое древо Дади-Юрт',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        treeDir: 'drewo-reklama',
        code: 'demo',
        title: 'Демо (реклама)',
        ownership: 'mine',
        note: 'Витрина для рекламы',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };
}

export function parseRegistry(raw?: string): RegistryFile {
  if (!raw) return defaultRegistry();
  try {
    const parsed = JSON.parse(raw) as RegistryFile;
    if (!parsed || !Array.isArray(parsed.trees)) return defaultRegistry();
    const trees = parsed.trees
      .map((item) => normalizeRegistryEntry(item))
      .filter((item): item is RegistryEntry => Boolean(item));
    const byDir = new Map<string, RegistryEntry>();
    for (const legacy of defaultRegistry().trees) byDir.set(legacy.treeDir, legacy);
    for (const item of trees) byDir.set(item.treeDir, item);
    return { version: 1, trees: Array.from(byDir.values()) };
  } catch {
    return defaultRegistry();
  }
}

function normalizeRegistryEntry(raw: unknown): RegistryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const treeDir = typeof item.treeDir === 'string' ? item.treeDir.trim() : '';
  const code = typeof item.code === 'string' ? item.code.trim().toLowerCase() : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!treeDir || !code || !title) return null;
  const ownership = item.ownership === 'customer' ? 'customer' : 'mine';
  return {
    treeDir,
    code,
    title: title.slice(0, 80),
    ownership,
    note: typeof item.note === 'string' ? item.note.trim().slice(0, 200) : '',
    createdAt:
      typeof item.createdAt === 'string' && item.createdAt
        ? item.createdAt
        : new Date().toISOString(),
  };
}

export function serializeRegistry(registry: RegistryFile): string {
  return `${JSON.stringify({ version: 1, trees: registry.trees }, null, 2)}\n`;
}

export function normalizeTreeCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export function isValidTreeCode(code: string): boolean {
  return /^[a-z][a-z0-9-]{1,24}$/.test(code) && !code.includes('--');
}

export function treeDirFromCode(code: string): string {
  return `drewo-${code}`;
}

export function assertCreatableTreeDir(treeDir: string, existingDirs: Iterable<string>) {
  if (RESERVED_DIRS.has(treeDir)) {
    throw new Error('Этот код занят системным древом');
  }
  if (!treeDir.startsWith('drewo-') || treeDir === 'drewo-') {
    throw new Error('Некорректный путь древа');
  }
  for (const dir of existingDirs) {
    if (dir === treeDir) throw new Error('Древо с таким кодом уже есть');
  }
}

export function slugifyRootId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || `root-${Date.now().toString(36)}`;
}

export function buildRootTreeJson(rootName: string): string {
  const id = slugifyRootId(rootName);
  return `${JSON.stringify(
    {
      id,
      name: rootName.trim().slice(0, 80),
      gender: 'male',
      sons: [],
    },
    null,
    2
  )}\n`;
}

export function customizeTemplateHtml(options: {
  html: string;
  treeDir: string;
  title: string;
  rootName: string;
  treeJson: string;
}): string {
  let html = options.html;
  const title = options.title.trim().slice(0, 80);
  const rootName = options.rootName.trim().slice(0, 80);
  let rootId = slugifyRootId(rootName);
  try {
    const parsed = JSON.parse(options.treeJson) as { id?: unknown };
    if (typeof parsed.id === 'string' && parsed.id.trim()) rootId = parsed.id.trim();
  } catch {
    // keep slug
  }

  html = html.split(TEMPLATE_DIR).join(options.treeDir);

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(
    /content="Некъ \(демо\)"/g,
    `content="${escapeAttr(title)}"`
  );
  html = html.replace(
    /<strong id="gate-title">[\s\S]*?<\/strong>/i,
    `<strong id="gate-title">Вход в ${escapeHtml(title)}</strong>`
  );
  html = html.replace(/<p class="gate-demo-hint"[\s\S]*?<\/p>/i, '');
  html = html.replace(/>Войти в демо</g, '>Войти<');
  html = html.replace(/var DEMO_GATE_PERSON_ID = 'islam-a';/, "var DEMO_GATE_PERSON_ID = '';");
  html = html.replace(/var DEMO_GATE_PASSWORD = 'демо';/, "var DEMO_GATE_PASSWORD = '';");
  html = html.replace(/var DEMO_MODE = true;/, 'var DEMO_MODE = false;');
  // Customer trees: add-person gate must be the new root, not demo «alkhan».
  html = html.replace(/var NUTSU_ID = 'alkhan';/, `var NUTSU_ID = ${JSON.stringify(rootId)};`);
  html = html.replace(/var KHOTU_ID = 'bersa';/, `var KHOTU_ID = ${JSON.stringify(rootId)};`);
  html = html.replace(/gateSubmit\.textContent = 'Войти в демо';/g, "gateSubmit.textContent = 'Войти';");
  html = html.replace(/<h1>Некъ<\/h1>/i, `<h1>${escapeHtml(title)}</h1>`);
  html = html.replace(/>Линия Берса</g, `>Линия ${escapeHtml(rootName)}<`);

  html = injectScriptJson(html, 'tree-data', options.treeJson.trim());
  html = injectScriptJson(html, 'activity-log', '[]');

  if (!html.includes('id="trees-hub-back"')) {
    html = html.replace(
      /<body([^>]*)>/i,
      `<body$1>
  <div id="trees-hub-back" class="trees-hub-back" hidden>
    <a href="/trees/">← К списку древ</a>
  </div>
  <script>
    (function () {
      try {
        var params = new URLSearchParams(window.location.search);
        if (params.get("from") !== "trees") return;
        var bar = document.getElementById("trees-hub-back");
        if (!bar) return;
        bar.hidden = false;
        document.body.classList.add("has-trees-hub-back");
      } catch (err) {}
    })();
  </script>`
    );
  }

  if (!html.includes('drewo-billing-banner.js')) {
    const billingScripts = `
  <script src="/trees/billing-config.js?v=1"></script>
  <script src="/assets/drewo-billing.js?v=1"></script>
  <script src="/assets/drewo-billing-banner.js?v=1"></script>
`;
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${billingScripts}</body>`);
    } else {
      html += billingScripts;
    }
  }

  return html;
}

export function buildManifest(title: string): string {
  const shortName = title.trim().slice(0, 24) || 'Древо';
  return `${JSON.stringify(
    {
      name: title.trim().slice(0, 80),
      short_name: shortName,
      description: 'Семейное древо',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#12262f',
      theme_color: '#12262f',
      lang: 'ru',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2
  )}\n`;
}

export function buildInviteStubHtml(options: {
  title: string;
  treeDir: string;
}): string {
  const target = `/${options.treeDir}/`;
  const title = options.title.trim().slice(0, 80) || 'Древо';
  const safeTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex, nofollow" />
    <meta http-equiv="refresh" content="0;url=${target}" />
    <link rel="canonical" href="https://waydean.ru${target}" />
    <title>${safeTitle}</title>
    <script>location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <p><a href="${target}">Открыть «${safeTitle}»</a></p>
  </body>
</html>
`;
}

export function invitePathForCode(code: string): string {
  return `/t/${code}`;
}

export function buildReadme(title: string, treeDir: string, code: string): string {
  return `# ${title}

Страница: https://waydean.ru/${treeDir}/

Короткая ссылка: https://waydean.ru/t/${code}

Код приглашения: \`${code}\`

Вход: своё имя из списка + пароль семьи.
`;
}

export function templateAssetNames(): string[] {
  return TEMPLATE_ASSET_NAMES.slice();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function injectScriptJson(html: string, scriptId: string, jsonText: string): string {
  const normalized = String(jsonText ?? '').trim();
  if (!normalized) return html;

  const patterns = [
    new RegExp(
      `(<script\\b[^>]*\\bid\\s*=\\s*["']${scriptId}["'][^>]*>)([\\s\\S]*?)(<\\/script>)`,
      'i'
    ),
    new RegExp(
      `(<script\\b[^>]*\\bid\\s*=\\s*${scriptId}(?=[\\s>])[^>]*>)([\\s\\S]*?)(<\\/script>)`,
      'i'
    ),
  ];

  for (const re of patterns) {
    const next = html.replace(re, (_m, open: string, _body: string, close: string) => {
      return `${open}\n${normalized}\n${close}`;
    });
    if (next !== html) return next;
  }

  const tag = `\n<script type="application/json" id="${scriptId}">\n${normalized}\n</script>\n`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tag}</body>`);
  }
  return html + tag;
}
