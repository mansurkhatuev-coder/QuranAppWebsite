export const APPEARANCE_THEME_KEY = 'drewo-theme';
export const APPEARANCE_SKY_KEY = 'drewo-sky-mode';
export const WEATHER_CACHE_KEY = 'drewo-weather-cache';
export const WEATHER_CACHE_MAX_AGE_MS = 45 * 60 * 1000;

const WEATHER_LABELS = new Map([
  [0, 'ясно'], [1, 'почти ясно'], [2, 'облачно'], [3, 'пасмурно'],
  [45, 'туман'], [48, 'туман'], [51, 'морось'], [53, 'морось'], [55, 'морось'],
  [56, 'ледяная морось'], [57, 'ледяная морось'], [61, 'дождь'], [63, 'дождь'],
  [65, 'ливень'], [66, 'ледяной дождь'], [67, 'ледяной дождь'], [71, 'снег'],
  [73, 'снег'], [75, 'снег'], [77, 'снежная крупа'], [80, 'ливень'], [81, 'ливень'],
  [82, 'сильный ливень'], [85, 'снегопад'], [86, 'снегопад'], [95, 'гроза'],
  [96, 'гроза с градом'], [99, 'гроза с градом']
]);

export function normalizeAppearance(value = {}) {
  return {
    theme: value.theme === 'classic' ? 'classic' : 'premium',
    skyMode: value.skyMode === 'day' || value.skyMode === 'night' ? value.skyMode : 'auto'
  };
}

export function readAppearance(storage) {
  try {
    return normalizeAppearance({
      theme: storage?.getItem(APPEARANCE_THEME_KEY),
      skyMode: storage?.getItem(APPEARANCE_SKY_KEY)
    });
  } catch {
    return normalizeAppearance();
  }
}

export function writeAppearance(storage, value) {
  const appearance = normalizeAppearance(value);
  try {
    if (!storage || typeof storage.setItem !== 'function') return { ...appearance, persisted: false };
    storage.setItem(APPEARANCE_THEME_KEY, appearance.theme);
    storage.setItem(APPEARANCE_SKY_KEY, appearance.skyMode);
    return { ...appearance, persisted: true };
  } catch {
    // Keep the current page usable if storage is unavailable or full.
    return { ...appearance, persisted: false };
  }
}

export function resolveSkyPeriod(mode, now = new Date(), sunTimes = null) {
  const { skyMode } = normalizeAppearance({ skyMode: mode });
  if (skyMode === 'day' || skyMode === 'night') return skyMode;
  const instant = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const riseMs = Number(sunTimes?.riseMs);
  const setMs = Number(sunTimes?.setMs);
  if (Number.isFinite(instant) && Number.isFinite(riseMs) && Number.isFinite(setMs) && riseMs < setMs) {
    return instant < riseMs || instant >= setMs ? 'night' : 'day';
  }
  const hour = now instanceof Date ? now.getHours() : new Date(now).getHours();
  return hour < 6 || hour >= 20 ? 'night' : 'day';
}

export function weatherCondition(code) {
  if (code === null || code === undefined || code === '') return 'погода';
  return WEATHER_LABELS.get(Number(code)) || 'погода';
}

function isDistrictName(value) {
  return /район$/i.test(String(value || '').trim());
}

export function pickWeatherPlace(data) {
  if (!data) return '';
  const administrative = data.localityInfo?.administrative;
  if (Array.isArray(administrative) && administrative.length) {
    let settlement = null;
    let best = null;
    for (const item of administrative) {
      if (!item) continue;
      let name = String(item.name || '').trim();
      if (!name || isDistrictName(name)) continue;
      name = name.replace(/^Город\s+/i, '');
      const description = String(item.description || '').toLowerCase();
      const level = Number(item.adminLevel) || 0;
      if (/село|посёл|посел|деревн|станиц|аул|пос\./.test(description)) {
        if (!settlement || level >= settlement.adminLevel) settlement = { name, adminLevel: level };
        continue;
      }
      if (level < 6) continue;
      if (!best || level > best.adminLevel || (level === best.adminLevel && name.length < best.name.length)) {
        best = { name, adminLevel: level };
      }
    }
    if (settlement?.name) return settlement.name;
    if (best?.name) return best.name;
  }
  const locality = String(data.locality || '').trim();
  const city = String(data.city || '').trim();
  const subdivision = String(data.principalSubdivision || '').trim();
  if (locality && !isDistrictName(locality)) return locality;
  if (city && !isDistrictName(city)) return city;
  return locality || city || subdivision;
}

export function readWeatherCache(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage?.getItem(WEATHER_CACHE_KEY) || 'null');
    const at = Number(value?.at);
    const tempText = String(value?.tempText || '').trim();
    if (!Number.isFinite(at) || !tempText) return null;
    const timestamp = now instanceof Date ? now.getTime() : Number(now);
    const age = timestamp - at;
    const candidateSunTimes = value.sunTimes;
    const riseMs = Number(candidateSunTimes?.riseMs);
    const setMs = Number(candidateSunTimes?.setMs);
    const sunTimes = Number.isFinite(riseMs) && Number.isFinite(setMs) && riseMs < setMs
      ? { riseMs, setMs }
      : null;
    return {
      at,
      tempText,
      subText: String(value.subText || 'погода'),
      place: String(value.place || 'Погода рядом'),
      sunTimes,
      fresh: age >= 0 && age < WEATHER_CACHE_MAX_AGE_MS
    };
  } catch {
    return null;
  }
}

function parseWeatherLocalTime(value, utcOffsetSeconds) {
  if (typeof value !== 'string' || !value) return NaN;
  const includesTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(includesTimezone ? value : `${value}Z`);
  if (!Number.isFinite(parsed)) return NaN;
  return includesTimezone ? parsed : parsed - utcOffsetSeconds * 1000;
}

function sunTimesFromForecast(data) {
  const sunrise = data?.daily?.sunrise?.[0];
  const sunset = data?.daily?.sunset?.[0];
  if (!sunrise || !sunset) return null;
  const offset = Number(data.utc_offset_seconds) || 0;
  const riseMs = parseWeatherLocalTime(sunrise, offset);
  const setMs = parseWeatherLocalTime(sunset, offset);
  return Number.isFinite(riseMs) && Number.isFinite(setMs) && riseMs < setMs
    ? { riseMs, setMs }
    : null;
}

function geolocationErrorMessage(error) {
  if (error?.code === 1) return 'Разрешение на геолокацию запрещено в настройках браузера.';
  if (error?.code === 3) return 'Геолокация не ответила вовремя. Попробуйте ещё раз.';
  if (error?.code === 2) return 'Устройство пока не может определить местоположение.';
  return error?.message || 'Не удалось определить местоположение.';
}

export function createWeatherController({
  geolocation = globalThis.navigator?.geolocation,
  fetchImpl = globalThis.fetch,
  storage = null,
  onChange = () => {},
  now = () => Date.now()
} = {}) {
  const getNow = typeof now === 'function' ? now : () => Number(now);
  const initial = readWeatherCache(storage, getNow());
  let state = initial
    ? { ...initial, status: initial.fresh ? 'cached' : 'stale', message: '' }
    : { status: 'idle', tempText: '', subText: '', place: '', sunTimes: null, message: '' };
  let inFlight = null;

  const snapshot = () => ({ ...state, sunTimes: state.sunTimes ? { ...state.sunTimes } : null });
  const update = next => {
    state = next;
    try { onChange(snapshot()); } catch { /* UI updates must not break a weather request. */ }
    return snapshot();
  };
  const cachedFallback = (message, cached = readWeatherCache(storage, getNow())) => cached
    ? update({ ...cached, status: cached.fresh ? 'cached' : 'stale', message })
    : update({ status: 'error', tempText: '', subText: '', place: '', sunTimes: null, message });

  async function fetchJson(url) {
    if (typeof fetchImpl !== 'function') throw new Error('Сетевой запрос недоступен.');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? globalThis.setTimeout(() => controller.abort(), 10_000) : null;
    try {
      const response = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
      if (response?.ok === false) throw new Error(`Сервер погоды ответил ${response.status}.`);
      return await response.json();
    } finally {
      if (timer !== null) globalThis.clearTimeout(timer);
    }
  }

  function getPosition() {
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
      return Promise.reject(new Error('В этом браузере геолокация недоступна.'));
    }
    return new Promise((resolve, reject) => {
      geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0
      });
    });
  }

  async function lookupPlace(latitude, longitude) {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('localityLanguage', 'ru');
    try {
      return pickWeatherPlace(await fetchJson(url.href));
    } catch {
      await new Promise(resolve => globalThis.setTimeout(resolve, 400));
      try { return pickWeatherPlace(await fetchJson(url.href)); } catch { return ''; }
    }
  }

  async function requestWeather() {
    const position = await getPosition();
    const latitude = Number(position?.coords?.latitude);
    const longitude = Number(position?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Геолокация вернула неверные координаты.');

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', latitude);
    forecastUrl.searchParams.set('longitude', longitude);
    forecastUrl.searchParams.set('current', 'temperature_2m,weather_code');
    forecastUrl.searchParams.set('daily', 'sunrise,sunset');
    forecastUrl.searchParams.set('timezone', 'auto');
    const [data, place] = await Promise.all([
      fetchJson(forecastUrl.href),
      lookupPlace(latitude, longitude)
    ]);
    const current = data?.current;
    if (!current) throw new Error('Сервис не вернул текущую погоду.');
    const temperature = Math.round(Number(current.temperature_2m));
    const tempText = Number.isFinite(temperature) ? `${temperature}°` : '—';
    const condition = weatherCondition(current.weather_code);
    const placeName = place || 'Погода рядом';
    const subText = place ? `${condition} · ${place}` : condition;
    const sunTimes = sunTimesFromForecast(data);
    const cacheEntry = { at: getNow(), tempText, subText, place: placeName, sunTimes };
    try { storage?.setItem(WEATHER_CACHE_KEY, JSON.stringify(cacheEntry)); } catch { /* Weather remains usable without storage. */ }
    return update({ ...cacheEntry, status: 'ready', fresh: true, message: '' });
  }

  function load({ force = false } = {}) {
    if (inFlight) return inFlight;
    const cached = readWeatherCache(storage, getNow());
    if (!force && cached?.fresh) return Promise.resolve(update({ ...cached, status: 'cached', message: '' }));
    update({ ...state, status: 'loading', message: 'Определяем погоду рядом…' });
    inFlight = requestWeather()
      .catch(error => cachedFallback(geolocation && error?.code ? geolocationErrorMessage(error) : error?.message || 'Не удалось загрузить погоду.'))
      .finally(() => { inFlight = null; });
    return inFlight;
  }

  return { getState: snapshot, load };
}
