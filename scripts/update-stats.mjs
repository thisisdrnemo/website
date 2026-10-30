// Refreshes the YouTube data shown on the site, so visitors' browsers never contact YouTube.
// No API key needed:
//   - latest video: first video on youtube.com/@drnemo/videos
//   - numbers: the same request YouTube makes when you tap "more" on the channel page
//   - titles (oEmbed) and thumbnails (saved into /thumbs)
// Any failure only prints a warning and keeps the previous values: it never blocks the deploy.
// Note: this file avoids the "less than" character on purpose (the GitHub editor on iPad cuts pastes there).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const HANDLE = 'drnemo';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cookie': 'SOCS=CAI; CONSENT=YES+cb',
};
const warn = (msg) => console.log('::warning::' + msg);
const get = async (url, opts = {}) => {
  const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res;
};

const stats = JSON.parse(readFileSync('stats.json', 'utf8'));
stats.titles = stats.titles || {};
delete stats.channelId;

// 1. Latest video: the first one on the Videos tab
let videosPage = '';
try {
  videosPage = await (await get(`https://www.youtube.com/@${HANDLE}/videos?hl=en&gl=US`)).text();
  const grid = videosPage.indexOf('"richItemRenderer"');
  const id = grid === -1 ? null : videosPage.slice(grid).match(/"videoId":"([\w-]{11})"/)?.[1];
  if (id) stats.latest = { id, title: stats.titles[id] || '' };
  else warn('Videos tab: could not find the first video');
  console.log(`Latest video: ${id}`);
} catch (e) { warn('Videos tab: ' + e.message); }

// 2. Numbers: replay the "more" panel request
try {
  const page = videosPage || await (await get(`https://www.youtube.com/@${HANDLE}?hl=en&gl=US`)).text();
  const apiKey = page.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const version = page.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20240101.00.00';
  const tokens = [...new Set([...page.matchAll(/"continuationCommand":\{"token":"([^"]+)"/g)].map((m) => m[1]))];
  let found = null;
  for (const token of tokens.slice(0, 8)) {
    const res = await get(`https://www.youtube.com/youtubei/v1/browse?prettyPrint=false${apiKey ? '&key=' + apiKey : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: version, hl: 'en', gl: 'US' } }, continuation: token }),
    });
    const text = await res.text();
    if (text.includes('viewCountText')) { found = text; break; }
  }
  if (!found) throw new Error(`stats panel not found (${tokens.length} tokens tried)`);
  const pick = (key, word) => {
    const m = found.match(new RegExp(`"${key}":(?:\\{"simpleText":)?"([\\d.,]+\\s?[KMB]?) ${word}`, 'i'));
    return m ? toNumber(m[1]) : null;
  };
  const views = pick('viewCountText', 'views');
  const vids = pick('videoCountText', 'videos');
  const subs = pick('subscriberCountText', 'subscribers');
  console.log(`Channel stats read: ${views} views, ${vids} videos, ${subs} subs`);
  if (views && views >= (stats.viewCount || 0) * 0.9) stats.viewCount = views;
  if (vids && vids > 0 && 10000 > vids) stats.videoCount = vids;
  if (subs && subs >= (stats.subscriberCount || 0) * 0.5) stats.subscriberCount = subs;
} catch (e) { warn('Channel stats: ' + e.message + ' (keeping the numbers in stats.json)'); }

// 3. Titles + thumbnails for the tapes (IDs read from index.html) and the latest video
const html = readFileSync('index.html', 'utf8');
const ids = [...new Set([...html.matchAll(/data-vid="([\w-]{11})"/g)].map((m) => m[1]).concat(stats.latest?.id || []))];
mkdirSync('thumbs', { recursive: true });
for (const id of ids) {
  try {
    const o = await (await get(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`)).json();
    if (o.title) stats.titles[id] = o.title;
  } catch (e) { warn(`Title for ${id}: ` + e.message); }
  for (const size of ['maxresdefault', 'sddefault', 'hqdefault']) {
    try {
      const img = await get(`https://i.ytimg.com/vi/${id}/${size}.jpg`);
      writeFileSync(`thumbs/${id}.jpg`, Buffer.from(await img.arrayBuffer()));
      break;
    } catch { /* try the next size */ }
  }
}
if (stats.latest?.id && stats.titles[stats.latest.id]) stats.latest.title = stats.titles[stats.latest.id];

stats.updated = new Date().toISOString().slice(0, 10);
writeFileSync('stats.json', JSON.stringify(stats, null, 2));
console.log(`Done. Latest: "${stats.latest?.title}". Titles: ${Object.keys(stats.titles).length}. ` +
            `Numbers: ${stats.videoCount} videos, ${stats.viewCount} views, ${stats.subscriberCount} subs.`);

function toNumber(t) {
  const m = t.replace(/\s/g, '').match(/^([\d.,]+)([KMB]?)$/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()] || 1;
  const n = mult > 1 ? parseFloat(m[1].replace(',', '.')) : parseFloat(m[1].replace(/[.,]/g, ''));
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}
