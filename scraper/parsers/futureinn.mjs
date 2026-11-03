// 日野市・国分寺市・立川市など、同じCMS（イベントカレンダーJS版）を使う市のデータファイルを読む。
// ファイルは `var event_data = { events: [...], categories: {...}, ... }` という JS だが、
// 実行はせずに JSON 部分だけを取り出して解析する。
import { extractJson, strip } from './util.mjs';

export function parseFutureinn(src) {
  const events = extractJson(src, 'events');
  if (!Array.isArray(events)) throw new Error('イベントデータの形式が変わった可能性があります');
  return { events, categories: extractJson(src, 'categories') || {} };
}

/** データファイル → 共通形式 [{ title, url, dates, place, category, description, time }] */
export function futureinnEvents(src, baseUrl) {
  const { events, categories } = parseFutureinn(src);
  return events.filter((e) => e && e.eventtitle).map((e) => ({
    title: strip(e.eventtitle),
    url: new URL(e.url || '', baseUrl).href,
    dates: (e.opendays || []).map((d) => String(d).replaceAll('/', '-')),
    place: strip(e.place2 || ''),
    category: (e.category || []).map((c) => categories[c]).filter(Boolean).join('・'),
    description: strip(e.description).slice(0, 200),
    time: strip((e.times || []).join(' / ')),
  }));
}
