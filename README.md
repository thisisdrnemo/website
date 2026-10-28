# thisisdrnemo.com

The Dr. NEMO website. Everything is static and hosted on GitHub Pages.

## What's in here

| Path | What it is |
|---|---|
| `index.html` | The whole site (all pages live in this one file) |
| `404.html` | Same site, opens on the haunted VHS "NO SIGNAL" screen |
| `stats.json` | Video count, views, subscribers, latest upload, video titles |
| `img/` | Photos, favicon, share image |
| `fonts/` | Self-hosted fonts (no Google Fonts, GDPR-friendly) |
| `thumbs/` | YouTube thumbnails, filled in automatically by the workflow |
| `music.mp3` | Optional: the background track for the MUSIC button (add it yourself) |
| `scripts/update-stats.mjs` | Fetches the YouTube data |
| `.github/workflows/deploy.yml` | Refreshes the data daily and publishes the site |

## One-time setup

1. **Pages**: repo Settings → Pages → Build and deployment → Source: **GitHub Actions**.
   Custom domain: `www.thisisdrnemo.com`, then tick "Enforce HTTPS" once it's available.
2. **DNS** at your domain registrar (same as for radiant-together.com):
   - `www` → CNAME → `thisisdrnemo.github.io`
   - `@` (bare domain) → A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. **YouTube API key**: repo Settings → Secrets and variables → Actions → New repository secret,
   name `YT_API_KEY`, value = your key.
4. Actions tab → **Build and deploy** → **Run workflow**.

After that the site redeploys on every push to `main`, and once a day at ~6:17 Berlin time
with fresh numbers, the latest upload, titles and thumbnails.

## Everyday edits

- **Music**: drop an MP3 named `music.mp3` next to `index.html` and push.
- **Change a featured video**: in `index.html`, find the tape with `data-vid="..."` and replace
  the video ID (it appears twice in that block, in `data-vid` and in the link). The title and
  thumbnail update on the next deploy.
- **See OMEN without waiting for 3 AM**: open `https://www.thisisdrnemo.com/#omen`.
