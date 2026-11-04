// 地図表示。Leaflet（vendor/ に同梱）と国土地理院の地図タイルを使う。
// 地図を開いたときにだけライブラリを読み込む。
let L = null;
let map = null;
let cluster = null;
let baseLayer = null;
let fitted = false;

function load(tag, attrs) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    Object.assign(el, attrs);
    el.onload = resolve;
    el.onerror = reject;
    document.head.append(el);
  });
}

async function ensureLeaflet() {
  if (L) return L;
  await Promise.all([
    load('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css' }),
    load('link', { rel: 'stylesheet', href: 'vendor/leaflet.markercluster/MarkerCluster.css' }),
    load('link', { rel: 'stylesheet', href: 'vendor/leaflet.markercluster/MarkerCluster.Default.css' }),
  ]);
  await load('script', { src: 'vendor/leaflet/leaflet.js' });
  await load('script', { src: 'vendor/leaflet.markercluster/leaflet.markercluster.js' });
  L = window.L;
  return L;
}

const pin = (cls, size) => L.divIcon({
  className: '', html: `<span class="pin ${cls}"></span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2],
});

/**
 * rows: 表示するイベント（listOccurrences の結果）
 * opts.bases: 拠点（★で表示）, opts.popup(row): ポップアップのHTML, opts.isBig(ev)
 */
export async function showMap(el, rows, { bases = [], popup, isBig }) {
  await ensureLeaflet();
  if (!map) {
    el.innerHTML = '';
    map = L.map(el).setView([35.68, 139.42], 11);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
    }).addTo(map);
    cluster = L.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false });
    map.addLayer(cluster);
    baseLayer = L.layerGroup().addTo(map);
  }
  map.invalidateSize();
  cluster.clearLayers();
  baseLayer.clearLayers();

  // 期間中に何度も開催されるイベントは、最初の開催日の1つだけ置く
  const seen = new Set();
  const markers = [];
  for (const row of rows) {
    const ev = row.event;
    if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) continue;
    const key = ev.id || ev.name;
    if (seen.has(key)) continue;
    seen.add(key);
    const big = isBig(ev);
    const m = L.marker([ev.lat, ev.lng], {
      icon: pin(`${big ? 'big' : ''} ${ev.approxLoc ? 'approx' : ''}`, big ? 22 : 14),
      title: ev.name,
      zIndexOffset: big ? 500 : 0,
    });
    m.bindPopup(`<div class="popup">${popup(row)}${ev.approxLoc
      ? '<p class="hint">※会場の位置が分からないため、市役所の場所に表示しています。</p>' : ''}</div>`, { maxWidth: 300 });
    markers.push(m);
  }
  cluster.addLayers(markers);

  for (const b of bases) {
    L.marker([b.lat, b.lng], { icon: pin('base', 20), title: b.name, zIndexOffset: 1000 })
      .bindTooltip(b.name).addTo(baseLayer);
  }
  if (!fitted && markers.length) {
    map.fitBounds(cluster.getBounds(), { padding: [20, 20], maxZoom: 13 });
    fitted = true;
  }
  return markers.length;
}
