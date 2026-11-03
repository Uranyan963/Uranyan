// 下見用: probe-urls.txt のページを取得して scraper/probe/ に保存し、
// イベント関連っぽいリンクを links.txt に書き出す。
// トップページ（パスが / のURL）なら、日野市と同じCMSの event_data.js があるかも調べる。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fetchText } from './fetch.mjs';

const dir = new URL('./probe/', import.meta.url);
const urls = (await readFile(new URL('./probe-urls.txt', import.meta.url), 'utf8'))
  .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));

if (urls.length === 0) {
  console.log('probe-urls.txt にURLがないので何もしません');
  process.exit(0);
}

await mkdir(dir, { recursive: true });
const report = [];
await Promise.all(urls.map(async (url) => {
  const slug = url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 120);
  const lines = [];
  try {
    const { url: finalUrl, text } = await fetchText(url);
    await writeFile(new URL(`${slug}.html`, dir), text);
    lines.push(`## ${url} -> ${finalUrl} (${text.length} chars)`);
    if (new URL(url).pathname === '/') {
      for (const p of ['/event_data.js', '/event/calendar/list_calendar.html', '/calendar.json']) {
        try {
          const r = await fetchText(new URL(p, finalUrl).href);
          lines.push(`EXISTS ${p} (${r.text.length} chars) head=${JSON.stringify(r.text.slice(0, 80))}`);
        } catch (e) { lines.push(`missing ${p} (${e.message.split(' ')[0]})`); }
      }
    }
    const links = [...text.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(([, href, label]) => { try { return [new URL(href, finalUrl).href, label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()]; } catch { return null; } })
      .filter(Boolean)
      .filter(([href, label]) => /event|calendar|rss|feed|ical|\.ics|イベント|催し|カレンダー/i.test(href + label));
    lines.push(...[...new Set(links.map((l) => l.join('\t').slice(0, 200)))].slice(0, 25));
  } catch (e) {
    lines.push(`## ${url} ERROR ${e.message}`);
  }
  report.push(lines.join('\n'), '');
}));
await writeFile(new URL('links.txt', dir), report.join('\n'));
console.log(report.join('\n'));
