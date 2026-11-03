// 市のサイトからページを取得する。公開サービスとして、相手のサイトに迷惑をかけないように:
// - robots.txt で禁止されているURLは取得しない
// - 同じサイトへは間隔をあけて1件ずつ取得する
// - 連絡先（このリポジトリ）を User-Agent に入れる
export const USER_AGENT = 'tamafura-event-collector/1.0 (+https://github.com/Uranyan963/Uranyan)';
const UA_TOKEN = 'tamafura';
const INTERVAL_MS = Number(process.env.FETCH_INTERVAL_MS ?? 1500);

const robotsCache = new Map(); // origin -> Promise<rules>
const hostQueue = new Map(); // origin -> Promise（直前のリクエストが終わるまで待つ）

/** robots.txt を解析して、自分（tamafura または *）に当てはまる Allow/Disallow を返す */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'user-agent') {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && UA_TOKEN.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules).filter((r) => r.path !== '' || r.allow);
}

/** 一番長く一致したルールで判定（一致なし = 許可） */
export function isAllowed(rules, pathWithQuery) {
  let best = null;
  for (const r of rules) {
    const re = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (re.test(pathWithQuery) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow || best.path === '';
}

async function rawFetch(url) {
  return fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
}

function robotsFor(origin) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, rawFetch(`${origin}/robots.txt`)
      .then(async (res) => (res.ok ? parseRobots(await res.text()) : []))
      .catch(() => []));
  }
  return robotsCache.get(origin);
}

/** 同じサイトへのリクエストを1件ずつ、間隔をあけて実行する */
function throttled(origin, task) {
  const prev = hostQueue.get(origin) || Promise.resolve();
  const next = prev.then(task, task);
  hostQueue.set(origin, next.catch(() => {}).then(() => new Promise((r) => setTimeout(r, INTERVAL_MS))));
  return next;
}

/** URLを取得してUTF-8テキストで返す（Shift_JIS/EUC-JPのサイトにも対応） */
export async function fetchText(url) {
  const u = new URL(url);
  const rules = await robotsFor(u.origin);
  if (!isAllowed(rules, u.pathname + u.search)) throw new Error(`robots.txt で取得が禁止されています: ${url}`);
  return throttled(u.origin, async () => {
    const res = await rawFetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.subarray(0, 4096).toString('latin1');
    const charset = (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1]
      || head.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
    return { url: res.url, text: new TextDecoder(charset.toLowerCase()).decode(buf) };
  });
}
