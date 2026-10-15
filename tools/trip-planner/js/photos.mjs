const plain = (value) => String(value || '').replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|lt|gt|#39);/g,
  (entity) => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'" })[entity]).replace(/[\u2013\u2014]/g, ',').trim();
const https = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
};
const pages = (data) => Object.values(data?.query?.pages || {});

// Both callers use the same discovery and credit rules; only request policy differs.
export function createPhotoFinder(request, { now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  return async function findStopPhoto({ name, lat, lon, wikipedia, commons }) {
    if (typeof name !== 'string' || !name.trim() || name.length > 160) throw new Error('Enter a stop name of up to 160 characters.');
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Enter valid stop coordinates.');
    const key = JSON.stringify([name.trim(), lat, lon, wikipedia, commons]);
    const hit = cache.get(key);
    if (hit && now() - hit.time < 86400000) return hit.value;
    if (pending.has(key)) return pending.get(key);
    const query = (base, params) => {
      const url = new URL(base);
      url.search = new URLSearchParams({ action: 'query', format: 'json', origin: '*', ...params });
      return request(url.href);
    };
    const work = (async () => {
      const results = await Promise.allSettled([
        query(wikipedia, { generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: '10000', ggslimit: '10', prop: 'pageimages', piprop: 'name', pilicense: 'free' }),
        query(commons, { generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: '1000', ggslimit: '8', ggsnamespace: '6', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '640' })
      ]);
      const tokens = name.toLowerCase().split(/\W+/).filter((token) => token.length > 2);
      const relevance = (page) => tokens.reduce((score, token) => score + Number(page.title?.toLowerCase().includes(token)), 0);
      const wikiPages = results[0].status === 'fulfilled' ? pages(results[0].value).sort((a, b) => relevance(b) - relevance(a)) : [];
      const titles = [...new Set(wikiPages.map((page) => page.pageimage).filter(Boolean))].slice(0, 8);
      let wikiFiles = [];
      if (titles.length) {
        try { wikiFiles = pages(await query(commons, { titles: titles.map((title) => 'File:' + title).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '640' })); }
        catch { /* Nearby Commons files can still be used if page images fail. */ }
      }
      const nearby = results[1].status === 'fulfilled' ? pages(results[1].value).sort((a, b) => relevance(b) - relevance(a)) : [];
      if (results.every((result) => result.status === 'rejected')) throw new Error('Photo search is unavailable. Paste an image URL instead.');
      const candidates = [], seen = new Set();
      for (const page of [...wikiFiles, ...nearby].sort((a, b) => relevance(b) - relevance(a))) {
        const info = page.imageinfo?.[0], metadata = info?.extmetadata;
        if (!/^image\/(jpeg|png|webp|avif)$/.test(info?.mime || '')) continue;
        const imageUrl = https(info.thumburl || info.url), sourceUrl = https(info.descriptionurl);
        const author = plain(metadata?.Artist?.value), license = plain(metadata?.LicenseShortName?.value);
        if (!imageUrl || !sourceUrl || !author || !license || seen.has(imageUrl)) continue;
        // Preserve the complete license even for files with a very long author field.
        const imageCredit = `${author.slice(0, Math.max(1, 198 - license.length))}, ${license}`;
        candidates.push({ imageUrl, imageCredit, sourceUrl });
        seen.add(imageUrl);
        if (candidates.length === 4) break;
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { time: now(), value: candidates });
      return candidates;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  };
}
