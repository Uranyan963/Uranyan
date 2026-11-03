// 東京都の市（23区以外）の公式イベント情報を集めて data/events.json に保存する（GitHub Actions で毎日実行）。
// 取得に失敗した市は、前回保存したデータをそのまま残す。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { CITIES } from '../src/data.js';
import { SOURCES, UNSUPPORTED_REASON } from './sources.mjs';
import { normalize } from './normalize.mjs';
import { geocodeEvents } from './geocode.mjs';

const OUT = new URL('../data/events.json', import.meta.url);
const GEOCACHE = new URL('../data/geocache.json', import.meta.url);
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const only = process.argv[2]; // 例: node scraper/collect.mjs 三鷹市

let geocache = {};
try { geocache = JSON.parse(await readFile(GEOCACHE, 'utf8')); } catch { /* 初回 */ }

let prev = { events: [] };
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 初回 */ }

const results = await Promise.all(CITIES.filter((c) => !only || c.name === only).map(async (city) => {
  const fetcher = SOURCES[city.name];
  if (!fetcher) {
    return { status: { name: city.name, page: city.url, ok: false, unsupported: true, error: UNSUPPORTED_REASON[city.name], kept: 0 }, events: [] };
  }
  try {
    const raw = await fetcher(today);
    const events = normalize(raw, today, city);
    console.log(`${city.name}: ${raw.length}件取得 → ${events.length}件を掲載`);
    return { status: { name: city.name, page: city.url, ok: true, fetched: raw.length, kept: events.length }, events };
  } catch (e) {
    const old = prev.events.filter((ev) => ev.city === city.name && ev.rule.ranges.some(([, end]) => end >= today));
    console.error(`${city.name}: 取得失敗 (${e.message})。前回のデータ ${old.length}件を残します`);
    return { status: { name: city.name, page: city.url, ok: false, error: e.message, kept: old.length }, events: old };
  }
}));

// 会場の位置を調べる（調べた結果は次回に再利用）
const allEvents = results.flatMap((r) => r.events);
const geo = await geocodeEvents(allEvents, CITIES, geocache, { limit: Number(process.env.GEOCODE_LIMIT ?? 150) });
const located = allEvents.filter((e) => !e.approxLoc).length;
console.log(`位置: 新しく${geo.queried}件を検索、会場の位置が分かったイベント ${located}/${allEvents.length}件`);

const events = allEvents
  .sort((a, b) => a.rule.ranges[0][0].localeCompare(b.rule.ranges[0][0]));
const sources = results.map((r) => r.status);
const failed = sources.filter((s) => !s.ok && !s.unsupported);
console.log(`合計 ${events.length}件 / 失敗 ${failed.map((s) => s.name).join('、') || 'なし'}`);

if (!only) {
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ updatedAt: new Date().toISOString(), sources, events })}\n`);
  await writeFile(GEOCACHE, `${JSON.stringify(geocache)}\n`);
}
// 多くの市で失敗したらサイトの仕組みが変わった・ネットワーク障害などの可能性が高い。
// ワークフローを失敗させて運営者にメールで知らせる（公開中のサイトは前回のまま残る）。
const MAX_FAILURES = Number(process.env.MAX_FAILURES ?? 5);
if (failed.length >= MAX_FAILURES || sources.every((s) => !s.ok)) {
  console.error(`取得に失敗した市が ${failed.length} 件あります（上限 ${MAX_FAILURES}）`);
  process.exit(1);
}
