import test from 'node:test';
import assert from 'node:assert/strict';
import * as appearance from './waydean-preview-appearance.mjs';
import {
  APPEARANCE_THEME_KEY,
  APPEARANCE_SKY_KEY,
  normalizeAppearance,
  readAppearance,
  resolveSkyPeriod,
  writeAppearance
} from './waydean-preview-appearance.mjs';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

function jsonResponse(value) {
  return { ok: true, json: async () => value };
}

test('appearance defaults to premium with automatic local day and night', () => {
  assert.deepEqual(readAppearance(memoryStorage()), { theme: 'premium', skyMode: 'auto' });
});

test('reads the existing production preference keys', () => {
  const storage = memoryStorage({ [APPEARANCE_THEME_KEY]: 'classic', [APPEARANCE_SKY_KEY]: 'night' });
  assert.deepEqual(readAppearance(storage), { theme: 'classic', skyMode: 'night' });
});

test('normalizes unknown appearance values to safe defaults', () => {
  assert.deepEqual(normalizeAppearance({ theme: 'neon', skyMode: 'weather' }), {
    theme: 'premium', skyMode: 'auto'
  });
});

test('automatic sky switches at the legacy local-clock boundaries', () => {
  assert.equal(resolveSkyPeriod('auto', new Date(2026, 0, 1, 5, 59)), 'night');
  assert.equal(resolveSkyPeriod('auto', new Date(2026, 0, 1, 6, 0)), 'day');
  assert.equal(resolveSkyPeriod('auto', new Date(2026, 0, 1, 19, 59)), 'day');
  assert.equal(resolveSkyPeriod('auto', new Date(2026, 0, 1, 20, 0)), 'night');
  assert.equal(resolveSkyPeriod('day', new Date(2026, 0, 1, 23, 0)), 'day');
  assert.equal(resolveSkyPeriod('night', new Date(2026, 0, 1, 12, 0)), 'night');
});

test('automatic sky prefers cached local sunrise and sunset when available', () => {
  const beforeSunrise = new Date('2026-10-28T12:00:00.000Z');
  const afterSunset = new Date('2026-10-28T23:00:00.000Z');
  const sunTimes = {
    riseMs: Date.parse('2026-10-28T13:00:00.000Z'),
    setMs: Date.parse('2026-10-28T22:00:00.000Z')
  };
  assert.equal(resolveSkyPeriod('auto', beforeSunrise, sunTimes), 'night');
  assert.equal(resolveSkyPeriod('auto', new Date('2026-10-28T15:00:00.000Z'), sunTimes), 'day');
  assert.equal(resolveSkyPeriod('auto', afterSunset, sunTimes), 'night');
  assert.equal(resolveSkyPeriod('day', beforeSunrise, sunTimes), 'day');
  assert.equal(resolveSkyPeriod('night', new Date('2026-10-28T15:00:00.000Z'), sunTimes), 'night');
});

test('weather conditions use readable Russian labels', () => {
  assert.equal(typeof appearance.weatherCondition, 'function');
  assert.equal(appearance.weatherCondition(0), 'ясно');
  assert.equal(appearance.weatherCondition(61), 'дождь');
  assert.equal(appearance.weatherCondition(95), 'гроза');
  assert.equal(appearance.weatherCondition(999), 'погода');
  assert.equal(appearance.weatherCondition(null), 'погода');
});

test('weather place selection prefers settlements and ignores district labels', () => {
  assert.equal(typeof appearance.pickWeatherPlace, 'function');
  const place = appearance.pickWeatherPlace({
    city: 'Грозный район',
    localityInfo: { administrative: [
      { name: 'Заводской район', description: 'район', adminLevel: 8 },
      { name: 'Грозный', description: 'город', adminLevel: 6 },
      { name: 'Город Аргун', description: 'село', adminLevel: 7 }
    ] }
  });
  assert.equal(place, 'Аргун');
});

test('weather cache reads legacy entries without saving location coordinates', () => {
  assert.equal(typeof appearance.readWeatherCache, 'function');
  const storage = memoryStorage({
    'drewo-weather-cache': JSON.stringify({
      at: 1_798_000_000_000,
      tempText: '8°',
      subText: 'ясно · Грозный',
      place: 'Грозный',
      latitude: 43.3,
      longitude: 45.7
    })
  });
  const cached = appearance.readWeatherCache(storage, 1_798_000_100_000);
  assert.equal(cached.tempText, '8°');
  assert.equal(cached.place, 'Грозный');
  assert.equal(cached.fresh, true);
  assert.equal(cached.latitude, undefined);
  assert.equal(cached.longitude, undefined);
});

test('weather controller waits for an explicit request before reading geolocation', () => {
  assert.equal(typeof appearance.createWeatherController, 'function');
  let locationRequests = 0;
  const controller = appearance.createWeatherController({
    storage: memoryStorage(),
    geolocation: { getCurrentPosition() { locationRequests += 1; } },
    fetchImpl: async () => { throw new Error('unexpected request'); }
  });
  assert.equal(locationRequests, 0);
  assert.equal(controller.getState().status, 'idle');
});

test('explicit weather request fetches forecast and place then caches only display data', async () => {
  assert.equal(typeof appearance.createWeatherController, 'function');
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const storage = memoryStorage();
  let locationOptions;
  const calls = [];
  const controller = appearance.createWeatherController({
    storage,
    now: () => now,
    geolocation: {
      getCurrentPosition(success, _error, options) {
        locationOptions = options;
        success({ coords: { latitude: 43.3, longitude: 45.7 } });
      }
    },
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).includes('open-meteo')) return jsonResponse({
        current: { temperature_2m: 7.6, weather_code: 2 },
        daily: { sunrise: ['2026-10-28T07:10'], sunset: ['2026-10-28T17:25'] },
        utc_offset_seconds: 0
      });
      return jsonResponse({ locality: 'Грозный', city: 'Грозный' });
    }
  });

  await controller.load({ force: true });

  const state = controller.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.tempText, '8°');
  assert.equal(state.subText, 'облачно · Грозный');
  assert.deepEqual(state.sunTimes, {
    riseMs: Date.parse('2026-10-28T07:10:00.000Z'),
    setMs: Date.parse('2026-10-28T17:25:00.000Z')
  });
  assert.equal(locationOptions.maximumAge, 0);
  assert.equal(calls.length, 2);
  const cached = JSON.parse(storage.getItem('drewo-weather-cache'));
  assert.equal(cached.tempText, '8°');
  assert.equal(cached.place, 'Грозный');
  assert.equal(cached.latitude, undefined);
  assert.equal(cached.longitude, undefined);
});

test('failed refresh keeps stale weather visible and reports the refresh problem', async () => {
  assert.equal(typeof appearance.createWeatherController, 'function');
  const storage = memoryStorage({
    'drewo-weather-cache': JSON.stringify({
      at: 1_797_900_000_000,
      tempText: '4°',
      subText: 'пасмурно · Грозный',
      place: 'Грозный'
    })
  });
  const controller = appearance.createWeatherController({
    storage,
    now: () => 1_798_000_000_000,
    geolocation: { getCurrentPosition(_success, error) { error({ code: 1 }); } },
    fetchImpl: async () => { throw new Error('should not fetch without coordinates'); }
  });
  await controller.load({ force: true });
  assert.equal(controller.getState().status, 'stale');
  assert.equal(controller.getState().tempText, '4°');
  assert.match(controller.getState().message, /геолокац/i);
});

test('writes normalized preferences under the production keys', () => {
  const storage = memoryStorage();
  assert.deepEqual(writeAppearance(storage, { theme: 'classic', skyMode: 'day' }), {
    theme: 'classic', skyMode: 'day', persisted: true
  });
  assert.equal(storage.getItem(APPEARANCE_THEME_KEY), 'classic');
  assert.equal(storage.getItem(APPEARANCE_SKY_KEY), 'day');
});

test('storage failures do not prevent rendering with default preferences', () => {
  const storage = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); }
  };
  assert.deepEqual(readAppearance(storage), { theme: 'premium', skyMode: 'auto' });
  assert.deepEqual(writeAppearance(storage, { theme: 'classic', skyMode: 'night' }), {
    theme: 'classic', skyMode: 'night', persisted: false
  });
});
