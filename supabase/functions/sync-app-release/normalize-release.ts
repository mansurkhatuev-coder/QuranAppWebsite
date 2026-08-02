export type JsonObject = Record<string, unknown>;

export type ReleaseChannel = {
  latestVersion?: string;
  versionCode?: number;
  buildNumber?: number;
  url?: string;
  appStoreUrl?: string;
};

export type AppRelease = {
  ios: ReleaseChannel;
  android: {
    rustore: ReleaseChannel;
    apk?: ReleaseChannel;
  } & JsonObject;
  messageRu: string;
  messageEn: string;
} & JsonObject;

function getObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function hasKeys(value: JsonObject): boolean {
  return Object.keys(value).length > 0;
}

export function normalizeReleaseForSync(input: unknown): AppRelease {
  const source = getObject(input);
  const androidSource = getObject(source.android);
  const iosSource = getObject(source.ios);
  const rustoreSource = getObject(androidSource.rustore);
  const apkSource = getObject(androidSource.apk);
  const hasFlatApk =
    androidSource.latestVersion !== undefined ||
    androidSource.versionCode !== undefined ||
    androidSource.apkUrl !== undefined ||
    androidSource.apkLatestVersion !== undefined ||
    androidSource.apkVersionCode !== undefined;

  const rustore: ReleaseChannel = {
    ...rustoreSource,
    latestVersion: asString(rustoreSource.latestVersion) ?? asString(androidSource.latestVersion),
    versionCode: asNumber(rustoreSource.versionCode) ?? asNumber(androidSource.versionCode),
    url: asString(rustoreSource.url) ?? asString(androidSource.rustoreUrl),
  };

  const apk: ReleaseChannel = {
    ...apkSource,
    latestVersion:
      asString(apkSource.latestVersion) ??
      asString(androidSource.latestVersion) ??
      asString(androidSource.apkLatestVersion),
    versionCode:
      asNumber(apkSource.versionCode) ??
      asNumber(androidSource.versionCode) ??
      asNumber(androidSource.apkVersionCode),
    url: asString(apkSource.url) ?? asString(androidSource.apkUrl),
  };

  const ios: ReleaseChannel = {
    ...iosSource,
    latestVersion: asString(iosSource.latestVersion) ?? asString(source.iosLatestVersion),
    buildNumber: asNumber(iosSource.buildNumber) ?? asNumber(source.iosBuildNumber),
    appStoreUrl: asString(iosSource.appStoreUrl) ?? asString(source.appStoreUrl),
  };

  return {
    ...source,
    ios,
    android: {
      ...androidSource,
      rustore,
      ...(hasKeys(apkSource) || hasFlatApk ? { apk } : {}),
    },
    messageRu: asString(source.messageRu) ?? '',
    messageEn: asString(source.messageEn) ?? '',
  };
}
