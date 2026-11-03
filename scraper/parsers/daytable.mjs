// 「日付の見出し（行）の下に、その日のイベントへのリンクが並ぶ」形のカレンダーを読む汎用パーサー。
// 府中・町田・小金井・西東京・調布・あきる野・八王子・青梅・狛江で使う。
import { strip, ymd } from './util.mjs';

// イベントではないリンク（カレンダーの操作など）
const NAV = /calendar|event\.cgi|index\.cgi\?|\/category\/|event2\/\d|view\.\d+\.\d*|^#|^javascript:|^mailto:|^tel:|\/$/i;

/**
 * html: ページ
 * opts.pageUrl: 相対リンクの基準
 * opts.dayRe: 日付見出しの正規表現（グループ1=日、またはグループ1〜3=年月日）
 * opts.year, opts.month: dayRe が日だけのときの年月（省略時はページの thismonth から）
 * opts.end: 1日分の範囲の終わり（この文字列以降は無視）
 */
export function dayTableEvents(html, opts) {
  let { year, month } = opts;
  const fullDate = /\(.*\(.*\(/.test(opts.dayRe.source); // グループが3つ = 年月日つき
  if (!year && !fullDate) {
    const ym = html.match(/<p class="thismonth">\s*(\d{4})年(\d{1,2})月/);
    if (!ym) throw new Error('カレンダーの年月が見つかりません（形式が変わった可能性があります）');
    [year, month] = [ym[1], ym[2]];
  }
  const re = new RegExp(opts.dayRe.source, 'g');
  const marks = [...html.matchAll(re)];
  if (marks.length === 0) throw new Error('日付の見出しが見つかりません（形式が変わった可能性があります）');

  const byUrl = new Map();
  marks.forEach((m, i) => {
    const date = m[3] ? ymd(m[1], m[2], m[3]) : ymd(year, month, m[1]);
    let chunk = html.slice(m.index + m[0].length, marks[i + 1]?.index ?? html.length);
    if (opts.end) chunk = chunk.split(opts.end)[0];
    for (const a of chunk.matchAll(/(?:<img[^>]*alt="([^"]*)"[^>]*>\s*)?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = a[2].replace(/&amp;/g, '&');
      const title = strip(a[3]);
      if (NAV.test(href) || title.length < 3) continue;
      const url = new URL(href, opts.pageUrl).href;
      if (!byUrl.has(url)) byUrl.set(url, { title, url, dates: [], place: '', category: strip(a[1] || '') });
      const ev = byUrl.get(url);
      if (!ev.dates.includes(date)) ev.dates.push(date);
    }
  });
  return [...byUrl.values()];
}

// 府中市型（府中・町田・小金井・西東京）
export const LIST_CALENDAR = { dayRe: /<span class="calendar_day">(\d{1,2})日/, end: '</tr>' };
