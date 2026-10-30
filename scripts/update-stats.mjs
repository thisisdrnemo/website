// Refreshes the YouTube data shown on the site, so visitors' browsers never contact YouTube.
// Key-free: latest upload (RSS), titles (oEmbed), thumbnails, and numbers from the About page.
// Optional: exact numbers from the YouTube API if the YT_API_KEY secret works.
// Any failure only prints a warning: it never blocks the deploy.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const HANDLE = 'thisisdrnemo';
const KEY = process.env.YT_API_KEY;
// The consent cookie skips the EU cookie wall YouTube sometimes shows to servers.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'SOCS=CAI; CONSENT=YES+cb' };
const warn = (msg) => console.log('::warning::' + msg);

const stats = JSON.parse(readFileSync('stats.json', 'utf8'));
stats.titles = stats.titles || {};
const get = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res;
};

// 1. Channel ID
let channelId = stats.channelId;
if (!channelId) {
  try {
    const page = await (await get(`https://www.youtube.com/@${HANDLE}`)).text();
    channelId = (page.match(/"(?:channelId|externalId)":"(UC[\w-]{22})"/) ||
                 page.match(/channel\/(UC[\w-]{22})/) || [])[1];
    if (channelId) stats.channelId = channelId; else warn('Could not find the channel ID on the channel page');
  } catch (e) { warn('Channel page: ' + e.message); }
}

// 2. Latest upload from RSS
if (channelId) {
  try {
    const xml = await (await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)).text();
    const entry = xml.split('<entry>')[1];
    const id = entry?.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const title = entry?.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    if (id) stats.latest = { id, title: decode(title || '') };
  } catch (e) { warn('RSS feed: ' + e.message); }
}

// 3. Titles + thumbnails
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

// 4. Numbers from the public About page
try {
  const about = (await (await get(`https://www.youtube.com/@${HANDLE}/about?hl=en&gl=US`)).text()).replace(/\\u0026/g, '&');
  const pick = (key, word) => {
    const m = about.match(new RegExp(`"${key}":(?:\\{"simpleText":)?"([\\d.,]+\\s?[KMB]?) ${word}`, 'i')) ||
              about.match(new RegExp(`"([\\d.,]+\\s?[KMB]?) ${word}"`, 'i'));
    return m ? toNumber(m[1]) : null;
  };
  const views = pick('viewCountText', 'views');
  const vids = pick('videoCountText', 'videos');
  const subs = pick('subscriberCountText', 'subscribers');
  if (views && views >= (stats.viewCount || 0) * 0.9) stats.viewCount = views;
  if (vids && vids > 0 && vids < 10000) stats.videoCount = vids;
  if (subs && subs >= (stats.subscriberCount || 0) * 0.5) stats.subscriberCount = subs;
  console.log(`About page read: ${views} views, ${vids} videos, ${subs} subs`);
  if (!views && !vids && !subs) warn('About page: numbers not found, keeping the ones in stats.json');
} catch (e) { warn('About page: ' + e.message); }

// 5. Optional: exact numbers from the API
if (KEY && channelId) {
  try {
    const r = await get(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${KEY}`);
    const st = (await r.json()).items[0].statistics;
    stats.videoCount = Number(st.videoCount);
    stats.viewCount = Number(st.viewCount);
    if (!st.hiddenSubscriberCount) stats.subscriberCount = Number(st.subscriberCount);
  } catch (e) { warn('Numbers not updated (API): ' + e.message); }
}

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

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

