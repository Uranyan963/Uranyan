import { CATEGORIES, CITIES, EVENTS } from './data.js';
import { addDays, nextDaysOff, todayYmd, weekday, HOLIDAYS } from './dates.js';
import { listOccurrences } from './core.js';
import { searchAddress } from './places.js';

const $ = (sel) => document.querySelector(sel);
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const STORE_KEY = 'tamafura:v2';
const MAX_KM = 40; // スライダーの右端 = 距離の制限なし

// ── 端末内に保存する設定（失敗しても動くように） ──────────────
// 登録した場所（自宅など）や自作イベントは、この端末のブラウザにだけ保存し、どこにも送らない。
function load() {
  try {
    const v2 = JSON.parse(localStorage.getItem(STORE_KEY));
    if (v2) return v2;
    // 旧バージョンの設定から、自作イベントと表示設定だけ引き継ぐ
    const v1 = JSON.parse(localStorage.getItem('tamafura:v1')) || {};
    return { range: v1.range, cats: v1.cats, cities: v1.cities, custom: v1.custom };
  } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 保存できなくても続行 */ }
}

const defaults = {
  range: 'dayoff', base: 'none', km: 10, cats: Object.keys(CATEGORIES), cities: [], places: [], custom: [],
};
const state = { ...defaults };
for (const [k, v] of Object.entries(load())) if (v !== undefined && v !== null) state[k] = v;

let here = null;
let official = []; // data/events.json（市の公式サイトから毎日自動取得）

const esc = (s = '') => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

function md(ymd) {
  const [, m, d] = ymd.split('-').map(Number);
  const wd = weekday(ymd);
  const cls = ymd in HOLIDAYS || wd === 0 ? 'sun' : wd === 6 ? 'sat' : '';
  return `<span class="${cls}">${m}/${d}(${WD[wd]})</span>`;
}
const period = (from, to) => (from === to ? md(from) : `${md(from)} 〜 ${md(to)}`);

function currentRange() {
  const today = todayYmd();
  if (state.range === 'dayoff') return nextDaysOff(today);
  return [today, addDays(today, state.range === 'month' ? 30 : 90)];
}

// ── 拠点（距離の基準） ──────────────────────────
// base: 'none' | 'here' | 'saved:all' | 'saved:<id>' | 'city:<市名>'
function currentBases() {
  const [kind, key] = state.base.split(/:(.*)/);
  if (kind === 'here') return here ? [{ name: '現在地', ...here }] : [];
  if (kind === 'saved') return key === 'all' ? state.places : state.places.filter((p) => p.id === key);
  if (kind === 'city') {
    const c = CITIES.find((x) => x.name === key);
    return c ? [{ name: `${c.name}役所`, lat: c.lat, lng: c.lng }] : [];
  }
  return [];
}

function renderBaseSelect() {
  const opts = ['<option value="none">指定しない（距離で絞らない）</option>', '<option value="here">現在地</option>'];
  if (state.places.length) {
    opts.push('<optgroup label="登録した場所">');
    if (state.places.length > 1) opts.push('<option value="saved:all">登録した場所のどれかに近い</option>');
    for (const p of state.places) opts.push(`<option value="saved:${esc(p.id)}">${esc(p.name)}</option>`);
    opts.push('</optgroup>');
  }
  opts.push('<optgroup label="市役所">', ...CITIES.map((c) => `<option value="city:${esc(c.name)}">${esc(c.name)}役所</option>`), '</optgroup>');
  $('#base').innerHTML = opts.join('');
  if (![...$('#base').options].some((o) => o.value === state.base)) state.base = 'none';
  $('#base').value = state.base;
}

function renderPlaces() {
  $('#place-list').innerHTML = state.places.map((p) => `<li>${esc(p.name)}
    <button type="button" class="linkish" data-del-place="${esc(p.id)}">削除</button></li>`).join('')
    || '<li class="hint">まだ登録していません</li>';
}

function addPlace(name, lat, lng) {
  const label = (prompt('この場所の名前（例: 自宅、最寄り駅）', name) || '').trim();
  if (!label) return;
  const id = `p${Date.now()}`;
  state.places.push({ id, name: label.slice(0, 20), lat, lng });
  state.base = state.places.length > 1 ? 'saved:all' : `saved:${id}`;
  $('#place-results').innerHTML = '';
  save(); renderPlaces(); renderBaseSelect(); render();
}

function customEvents() {
  return state.custom.map((c) => ({
    id: c.id, name: c.name, city: '', place: c.place, note: c.note,
    category: 'custom', accuracy: 'custom',
    rule: { type: 'once', start: c.start, end: c.end || c.start },
  }));
}

function card({ event: ev, occ, distances }) {
  const year = occ.start.slice(0, 4);
  const nearest = [...distances].sort((a, b) => a.km - b.km)[0];
  const origin = nearest ? `&origin=${nearest.base.lat},${nearest.base.lng}` : '';
  const dest = ev.approxLoc || !Number.isFinite(ev.lat)
    ? encodeURIComponent(`${ev.city || ''} ${ev.place || ev.name}`.trim())
    : `${ev.lat},${ev.lng}`;
  const mapUrl = `https://www.google.com/maps/dir/?api=1${origin}&destination=${dest}&travelmode=transit`;
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${ev.name} ${year}`)}`;
  const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.name)}`
    + `&dates=${occ.start.replaceAll('-', '')}/${addDays(occ.end, 1).replaceAll('-', '')}`
    + `&location=${encodeURIComponent(ev.place || '')}`;

  const badge = {
    fixed: '<span class="badge fixed">毎年この日程</span>',
    approx: '<span class="badge approx">目安</span>',
    custom: '<span class="badge custom">自分で追加</span>',
    official: '<span class="badge fixed">市の公式情報</span>',
  }[ev.accuracy];
  const dist = distances.map((d) => `${esc(d.base.name)}から${d.km.toFixed(1)}km`).join(' / ');
  const where = ev.approxLoc ? '（市役所までの目安）' : '';

  return `<article class="card">
    <div class="when">${period(occ.start, occ.end)}${occ.label ? ` <b>${esc(occ.label)}</b>` : ''}</div>
    <h3>${esc(ev.name)}</h3>
    <div class="meta">${badge} <span class="cat">${esc(CATEGORIES[ev.category] || 'その他')}</span>
      ${ev.city ? `<span>${esc(ev.city)}</span>` : ''} <span>${esc(ev.place || '')}</span></div>
    ${dist ? `<div class="dist">📍 ${dist}${where}</div>` : ''}
    ${ev.tags ? `<div class="dist">${esc(ev.tags)}</div>` : ''}
    ${ev.note ? `<p class="note">${linkify(ev.note)}</p>` : ''}
    <div class="actions">
      <a href="${mapUrl}" target="_blank" rel="noopener">行き方</a>
      ${ev.url
    ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener">公式ページ</a>`
    : `<a href="${searchUrl}" target="_blank" rel="noopener">今年の情報を検索</a>`}
      <a href="${calUrl}" target="_blank" rel="noopener">カレンダーに追加</a>
      ${ev.accuracy === 'custom' ? `<button class="del" data-id="${esc(ev.id)}">削除</button>` : ''}
    </div>
  </article>`;
}

function render() {
  const [from, to] = currentRange();
  const bases = currentBases();
  $('#range-label').innerHTML = period(from, to);
  $('#km-out').textContent = state.km >= MAX_KM ? '制限なし' : `${state.km}km以内`;
  $('#km-wrap').hidden = bases.length === 0;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.range === state.range));
  document.querySelectorAll('#cats input').forEach((i) => { i.checked = state.cats.includes(i.value); });

  const all = listOccurrences([...EVENTS, ...official, ...customEvents()], {
    from, to, bases, maxKm: state.km >= MAX_KM ? Infinity : state.km, categories: new Set([...state.cats, 'custom']),
  });
  renderCities(all);
  // 市の指定がないイベント（自分で追加したもの）は常に表示
  const rows = state.cities.length ? all.filter((r) => !r.event.city || state.cities.includes(r.event.city)) : all;
  $('#count').textContent = `${rows.length}件`;
  $('#list').innerHTML = rows.length
    ? rows.map(card).join('')
    : '<p class="empty">この条件に合うイベントはありません。期間や距離を広げるか、市の絞り込みを解除してみてください。</p>';
}

function renderCities(rows) {
  const counts = {};
  for (const r of rows) if (r.event.city) counts[r.event.city] = (counts[r.event.city] || 0) + 1;
  $('#cities').innerHTML = CITIES.map((c) => {
    const n = counts[c.name] || 0;
    const on = state.cities.includes(c.name);
    return `<button type="button" class="chip city${on ? ' on' : ''}${n ? '' : ' zero'}" data-city="${esc(c.name)}" aria-pressed="${on}">${esc(c.name)} <small>${n}</small></button>`;
  }).join('');
  $('#city-summary').textContent = state.cities.length ? state.cities.join('・') : 'すべての市';
}

function renderSources(status) {
  $('#sources').innerHTML = CITIES.map((c) => {
    const st = status[c.name];
    const note = !st ? ''
      : st.unsupported ? `<span class="hint">${esc(st.error)}</span>`
        : st.ok ? `<span class="hint">${st.kept}件</span>`
          : `<span class="hint">取得失敗（前回分 ${st.kept}件）</span>`;
    return `<li><a href="${c.url}" target="_blank" rel="noopener">${esc(c.name)}</a> ${note}</li>`;
  }).join('');
}

async function loadOfficial() {
  try {
    const res = await fetch('data/events.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    official = (data.events || []).filter((ev) => /^https?:/.test(ev.url || ''));
    const when = new Date(data.updatedAt).toLocaleDateString('ja-JP');
    $('#official-status').textContent = `市の公式イベント ${official.length}件（${when} 自動取得）`;
    renderSources(Object.fromEntries((data.sources || []).map((s) => [s.name, s])));
    render();
  } catch { /* 自動取得データがなくても登録イベントだけで動く */ }
}

function setup() {
  $('#km').value = state.km;
  $('#cats').innerHTML = Object.entries(CATEGORIES)
    .map(([k, v]) => `<label class="chip"><input type="checkbox" value="${k}">${v}</label>`).join('');
  renderBaseSelect();
  renderPlaces();
  renderSources({});

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    state.range = b.dataset.range; save(); render();
  }));
  $('#km').addEventListener('input', (e) => { state.km = Number(e.target.value); save(); render(); });
  $('#cats').addEventListener('change', () => {
    state.cats = [...document.querySelectorAll('#cats input:checked')].map((i) => i.value); save(); render();
  });
  $('#cities').addEventListener('click', (e) => {
    const name = e.target.closest('[data-city]')?.dataset.city;
    if (!name) return;
    state.cities = state.cities.includes(name) ? state.cities.filter((c) => c !== name) : [...state.cities, name];
    save(); render();
  });
  $('#city-clear').addEventListener('click', () => { state.cities = []; save(); render(); });

  $('#base').addEventListener('change', (e) => {
    state.base = e.target.value; save();
    if (state.base === 'here' && !here) {
      if (!navigator.geolocation) { alert('この端末では現在地を取得できません'); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => { here = { lat: p.coords.latitude, lng: p.coords.longitude }; render(); },
        () => alert('現在地を取得できませんでした。位置情報の許可を確認してください。'),
      );
    }
    render();
  });

  // よく使う場所の登録
  $('#place-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    const box = $('#place-results');
    box.innerHTML = '<li class="hint">検索中…</li>';
    try {
      const results = await searchAddress(q);
      box.innerHTML = results.length
        ? results.map((r, i) => `<li><button type="button" class="linkish" data-result="${i}">${esc(r.name)}</button></li>`).join('')
        : '<li class="hint">見つかりませんでした。市区町村名から入れてみてください。</li>';
      box.onclick = (ev) => {
        const r = results[ev.target.closest('[data-result]')?.dataset.result];
        if (r) addPlace(r.name, r.lat, r.lng);
      };
    } catch {
      box.innerHTML = '<li class="hint">検索できませんでした。時間をおいて試してください。</li>';
    }
  });
  $('#place-here').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('この端末では現在地を取得できません'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => addPlace('現在地', p.coords.latitude, p.coords.longitude),
      () => alert('現在地を取得できませんでした。位置情報の許可を確認してください。'),
    );
  });
  $('#place-list').addEventListener('click', (e) => {
    const id = e.target.closest('[data-del-place]')?.dataset.delPlace;
    if (!id) return;
    state.places = state.places.filter((p) => p.id !== id);
    save(); renderPlaces(); renderBaseSelect(); render();
  });

  // 自分で追加するイベント
  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.end && f.end < f.start) f.end = f.start;
    state.custom.push({ id: `c${Date.now()}`, ...f });
    save(); e.target.reset(); render();
  });
  $('#list').addEventListener('click', (e) => {
    const id = e.target.closest('.del')?.dataset.id;
    if (id && confirm('このイベントを削除しますか？')) {
      state.custom = state.custom.filter((c) => c.id !== id); save(); render();
    }
  });

  render();
  loadOfficial();
}

setup();
