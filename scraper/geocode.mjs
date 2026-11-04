// 会場名から位置を調べる（国土地理院の住所検索）。地図に正しい場所で出すため。
// 結果は data/geocache.json に保存して次回以降は再利用する（同じ会場は一度しか調べない）。
import { fetchText } from './fetch.mjs';

const R = 6371;
const rad = (x) => (x * Math.PI) / 180;
function km(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 「ひの煉瓦ホール（日野市民会館）小ホール」→「ひの煉瓦ホール」のように検索しやすくする */
export function cleanPlace(place) {
  return String(place || '')
    .replace(/[（(\[［【].*$/, '')
    .replace(/\s*(\d+階|[0-9０-９]+F|地下\d*階?).*$/, '')
    .replace(/[　\s]+/g, '')
    .replace(/(ほか|など|周辺|付近|各所|内)$/, '')
    .trim();
}

/** 検索結果から、その市の中（市役所から maxKm 以内）にある最初の候補を選ぶ */
export function pickResult(list, city, maxKm = 12) {
  for (const f of Array.isArray(list) ? list : []) {
    const [lng, lat] = f?.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const title = String(f.properties?.title || '');
    if (km(city, { lat, lng }) <= maxKm && (title.includes(city.name) || title.includes('東京都'))) {
      return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, title };
    }
  }
  return null;
}

/**
 * events の place から位置を調べて lat/lng を付ける。見つからなければ市役所の位置のまま。
 * cache: { "市名|会場": {lat,lng,title} | null }
 */
export async function geocodeEvents(events, cities, cache, { limit = 150 } = {}) {
  let queried = 0;
  let hit = 0;
  for (const ev of events) {
    const q = cleanPlace(ev.place);
    if (q.length < 2) continue;
    const city = cities.find((c) => c.name === ev.city);
    if (!city) continue;
    const key = `${city.name}|${q}`;
    if (!(key in cache)) {
      if (queried >= limit) continue; // 1回に調べる数は控えめに。残りは次回
      queried++;
      try {
        const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q.includes(city.name) ? q : city.name + q)}`;
        cache[key] = pickResult(JSON.parse((await fetchText(url)).text), city);
      } catch (e) {
        console.warn(`  位置検索に失敗: ${key} (${e.message})`);
        continue; // 失敗はキャッシュしない（次回もう一度）
      }
    }
    const loc = cache[key];
    if (loc) {
      ev.lat = loc.lat;
      ev.lng = loc.lng;
      ev.approxLoc = false;
      hit++;
    }
  }
  return { queried, hit };
}
