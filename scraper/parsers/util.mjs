export const strip = (s = '') => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** start〜end の日付をすべて並べる（長すぎる期間は上限で打ち切り） */
export function expand(start, end, limit = 400) {
  const out = [];
  for (let d = start; d <= end && out.length < limit; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 「2026年11月7日」「2026年11月7日から2026年12月6日」などの文字列から日付を取り出す */
export function datesFromText(text) {
  const re = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
  const found = [...text.matchAll(re)].map((m) => ({ date: ymd(m[1], m[2], m[3]), index: m.index, end: m.index + m[0].length }));
  const dates = [];
  for (let i = 0; i < found.length; i++) {
    const next = found[i + 1];
    const between = next ? text.slice(found[i].end, next.index) : '';
    if (next && /^[^0-9]{0,20}?(から|～|〜|~|－|-)/.test(between) && next.date >= found[i].date) {
      dates.push(...expand(found[i].date, next.date));
      i++;
    } else {
      dates.push(found[i].date);
    }
  }
  return dates;
}

/** src の中の `key: <JSON>` を、JSを実行せずに括弧の対応だけで取り出して JSON.parse する */
export function extractJson(src, key) {
  const m = new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*`, 'm').exec(src);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  const open = src[i];
  const close = { '[': ']', '{': '}' }[open];
  if (!close) return undefined;
  let depth = 0;
  let inStr = false;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (inStr) {
      if (ch === '\\') j++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(src.slice(i, j + 1));
    }
  }
  return undefined;
}
