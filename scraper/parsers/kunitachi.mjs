// 国立市: https://www.city.kunitachi.tokyo.jp/calendar.json
import { expand, strip } from './util.mjs';

export function kunitachiEvents(json) {
  const list = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(list)) throw new Error('国立市データの形式が変わった可能性があります');
  return list.filter((e) => e.page_name && e.url).map((e) => ({
    title: strip(e.page_name),
    url: e.url,
    dates: (e.date_list || []).flatMap(([s, t]) => expand(s, t || s)),
    place: strip(e.event?.event_place || ''),
    category: '',
  }));
}
