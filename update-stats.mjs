// Fetches channel stats, the latest upload, video titles and thumbnails
// from the YouTube Data API, so the site never loads anything from YouTube.
// Runs inside the GitHub Action before each deploy. Needs the YT_API_KEY secret.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.YT_API_KEY;
const HANDLE = 'thisisdrnemo';
if (!KEY) { console.log('No YT_API_KEY set, keeping existing stats.json'); process.exit(0); }

const api = async (path) => {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`);
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  return res.json();
};

const old = JSON.parse(readFileSync('stats.json', 'utf8'));

try {

// 1. Channel numbers + uploads playlist
const ch = (await api(`channels?part=statistics,contentDetails&forHandle=${HANDLE}`)).items[0];
const st = ch.statistics;

// 2. Latest upload
const uploads = ch.contentDetails.relatedPlaylists.uploads;
const last = (await api(`playlistItems?part=snippet&maxResults=1&playlistId=${uploads}`)).items[0].snippet;
const latestId = last.resourceId.videoId;

// 3. Titles + thumbnails for the tapes on the Videos page (read from index.html) and the latest video
const html = readFileSync('index.html', 'utf8');
const ids = [...new Set([...html.matchAll(/data-vid="([^"]+)"/g)].map((m) => m[1]).concat(latestId))];
const vids = (await api(`videos?part=snippet&id=${ids.join(',')}`)).items;

mkdirSync('thumbs', { recursive: true });
const titles = {};
for (const v of vids) {
  titles[v.id] = v.snippet.title;
  const t = v.snippet.thumbnails;
  const url = (t.maxres || t.standard || t.high || t.medium || t.default).url;
  const img = await fetch(url);
  if (img.ok) writeFileSync(`thumbs/${v.id}.jpg`, Buffer.from(await img.arrayBuffer()));
}

const stats = {
  ...old,
  videoCount: Number(st.videoCount),
  viewCount: Number(st.viewCount),
  subscriberCount: st.hiddenSubscriberCount ? old.subscriberCount : Number(st.subscriberCount),
  latest: { id: latestId, title: titles[latestId] || last.title },
  titles,
  updated: new Date().toISOString().slice(0, 10),
};
writeFileSync('stats.json', JSON.stringify(stats, null, 2));
console.log(`Updated: ${stats.videoCount} videos, ${stats.viewCount} views, ${stats.subscriberCount} subs, latest "${stats.latest.title}"`);
} catch (err) {
  // Never block the deploy: keep the previous numbers and show the reason in the Actions log.
  console.log('::warning::YouTube update skipped: ' + err.message);
}
