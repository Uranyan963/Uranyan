// 住所・地名から座標を調べる（国土地理院の住所検索）。
// https://msearch.gsi.go.jp/address-search/AddressSearch?q=...
// 返り値: [{ name, lat, lng }]
export async function searchAddress(q, fetchImpl = fetch) {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`検索に失敗しました (${res.status})`);
  const list = await res.json();
  return (Array.isArray(list) ? list : [])
    .filter((f) => Array.isArray(f?.geometry?.coordinates))
    .slice(0, 8)
    .map((f) => ({
      name: String(f.properties?.title || q),
      lng: Number(f.geometry.coordinates[0]),
      lat: Number(f.geometry.coordinates[1]),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
