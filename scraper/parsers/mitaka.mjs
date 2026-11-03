// 三鷹市: イベント・講座一覧（index.cgi）。1ページ15件で、「次へ」をたどる。
import { datesFromText, strip } from './util.mjs';

export function mitakaEvents(html, pageUrl) {
  const blocks = html.split('class="eventblock').slice(1);
  if (blocks.length === 0 && !/該当する|ありません/.test(html)) {
    throw new Error('三鷹市の一覧の形式が変わった可能性があります');
  }
  return blocks.map((b) => {
    const a = b.match(/<h3[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const dateText = strip(b.match(/<p class="date">([\s\S]*?)<\/p>/)?.[1] || '');
    const cat = strip(b.match(/<span class="category">[^<]*<\/span>([^<]*)/)?.[1] || '');
    return a && {
      title: strip(a[2]), url: new URL(a[1], pageUrl).href, dates: datesFromText(dateText), place: '', category: cat,
    };
  }).filter(Boolean);
}

export function mitakaNextPage(html, pageUrl) {
  const m = html.match(/<a href="([^"]+)"[^>]*class="nextpage"/i);
  return m ? new URL(m[1].replace(/&amp;/g, '&'), pageUrl).href : null;
}
