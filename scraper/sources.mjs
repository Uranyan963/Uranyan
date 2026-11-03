// 市ごとの取得方法。type ごとに読み取り方が違う。
import { fetchText } from './fetch.mjs';
import { futureinnEvents } from './parsers/futureinn.mjs';
import { dayTableEvents, LIST_CALENDAR } from './parsers/daytable.mjs';
import { kunitachiEvents } from './parsers/kunitachi.mjs';
import { mitakaEvents, mitakaNextPage } from './parsers/mitaka.mjs';
import { pad } from './parsers/util.mjs';

/** 今月から n か月分の [年, 月] */
export function monthsFrom(today, n) {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return [d.getUTCFullYear(), d.getUTCMonth() + 1];
  });
}

// ── 取得方法の種類 ─────────────────────────
const futureinn = (origin, files) => async () => {
  const out = [];
  const errors = [];
  for (const f of files) {
    try {
      const url = new URL(f, origin).href;
      out.push(...futureinnEvents((await fetchText(url)).text, origin));
    } catch (e) { errors.push(e.message); }
  }
  if (out.length === 0) throw new Error(errors.join(' / ') || 'イベントが0件');
  return out;
};

// 月ごとのページを読む（先の月が未公開なのは問題なし）
const monthly = (urlFor, parseOpts, months = 3) => async (today) => {
  const out = [];
  for (const [i, [y, m]] of monthsFrom(today, months).entries()) {
    const url = urlFor(y, m, i);
    if (!url) continue;
    try {
      out.push(...dayTableEvents((await fetchText(url)).text, { pageUrl: url, year: y, month: m, ...parseOpts(y, m) }));
    } catch (e) {
      if (i === 0) throw e;
      console.warn(`  ${url}: ${e.message}`);
    }
  }
  return out;
};

const listCalendar = (origin) => monthly(
  (y, m, i) => `${origin}/event/calendar/list_calendar${i === 0 ? '' : `${y}${pad(m)}`}.html`,
  () => ({ ...LIST_CALENDAR, year: undefined, month: undefined }), // 年月はページの見出しから
);
const event2 = (origin) => monthly(
  (y, m) => `${origin}/event2/${y}${pad(m)}.html`,
  () => ({ dayRe: /<th scope="row" class="cal_date">(?:<strong>)?(\d{1,2})(?:<\/strong>)?<\/th>/, end: '</tr>' }),
);

// ── 26市 ─────────────────────────────────
export const SOURCES = {
  八王子市: monthly(
    (y, m) => `https://www.city.hachioji.tokyo.jp/event/event${y}${pad(m)}.html`,
    () => ({ dayRe: /<span>\d{4}年\d{1,2}月(\d{1,2})日（/, end: '</dl>' }),
  ),
  立川市: futureinn('https://www.city.tachikawa.lg.jp/', ['event.js']),
  武蔵野市: futureinn('https://www.city.musashino.lg.jp/', ['event_m.js', 'event_city.js']),
  三鷹市: async (today) => {
    const [y, m, d] = today.split('-').map(Number);
    const end = new Date(Date.UTC(y, m + 2, 0));
    let url = `https://www.city.mitaka.lg.jp/cgi-bin/event/index.cgi?start_y=${y}&start_m=${m}&start_d=${d}`
      + `&end_y=${end.getUTCFullYear()}&end_m=${end.getUTCMonth() + 1}&end_d=${end.getUTCDate()}&search=1`;
    const out = [];
    for (let page = 0; url && page < 15; page++) {
      const { text } = await fetchText(url);
      out.push(...mitakaEvents(text, url));
      url = mitakaNextPage(text, url);
    }
    return out;
  },
  青梅市: monthly(
    (y, m, i) => (i === 0 ? 'https://www.city.ome.tokyo.jp/calendar/' : null), // 今月分のみ公開
    () => ({ dayRe: /<span class="t_day">\s*<span>(\d{1,2})<\/span>日/, end: '</dl>' }),
  ),
  府中市: listCalendar('https://www.city.fuchu.tokyo.jp'),
  昭島市: futureinn('https://www.city.akishima.lg.jp/', ['event.js', 'event_renkei/event_list_new.js']),
  調布市: monthly(
    (y, m) => `https://www.city.chofu.lg.jp/cgi-bin/event_cal_multi/calendar.cgi?type=2&year=${y}&month=${m}`,
    () => ({ dayRe: /<span class="date_number">(\d{1,2})日<\/span>/, end: '</tr>' }),
  ),
  町田市: listCalendar('https://www.city.machida.tokyo.jp'),
  小金井市: listCalendar('https://www.city.koganei.lg.jp'),
  小平市: null, // 公式サイトが臨時案内ページになっていてイベント情報がない（2026年11月時点）
  日野市: futureinn('https://www.city.hino.lg.jp/', ['event_data.js']),
  東村山市: null, // 自動取得のアクセスが拒否される（403）
  国分寺市: futureinn('https://www.city.kokubunji.tokyo.jp/', ['event_data.js']),
  国立市: async () => kunitachiEvents((await fetchText('https://www.city.kunitachi.tokyo.jp/calendar.json')).text),
  福生市: null, // robots.txt でイベントカレンダー（/cgi-evt/）の自動取得が禁止されている
  狛江市: monthly(
    (y, m) => `https://www.city.komae.tokyo.jp/events/index.cfm/view.4.${y}${pad(m)}.-.html`,
    () => ({ dayRe: /<time datetime="(\d{4})-(\d{2})-(\d{2})">/, end: '</dl>' }),
  ),
  東大和市: futureinn('https://www.city.higashiyamato.lg.jp/', ['event.js']),
  清瀬市: futureinn('https://www.city.kiyose.lg.jp/', ['event.js', 'event_data.js']),
  東久留米市: futureinn('https://www.city.higashikurume.lg.jp/', ['event_d.js']),
  武蔵村山市: null, // robots.txt でイベントカレンダー（/cgi-evt/）の自動取得が禁止されている
  多摩市: futureinn('https://www.city.tama.lg.jp/', ['event.js']),
  稲城市: futureinn('https://www.city.inagi.tokyo.jp/', ['event.js']),
  羽村市: null, // イベントカレンダーにイベントが載っていない（観光イベントは日付のない記事一覧のみ）
  あきる野市: event2('https://www.city.akiruno.tokyo.jp'),
  西東京市: listCalendar('https://www.city.nishitokyo.lg.jp'),
};

export const UNSUPPORTED_REASON = {
  小平市: '公式サイトが臨時案内ページのため未対応',
  東村山市: '公式サイトが自動取得を拒否するため未対応',
  羽村市: '公式サイトのイベントカレンダーに掲載がないため未対応',
  福生市: '公式サイトが robots.txt で自動取得を禁止しているため未対応',
  武蔵村山市: '公式サイトが robots.txt で自動取得を禁止しているため未対応',
};
