# Cosmoly

**Fly a 3D galaxy of music.** Cosmoly is a free, no-ads, Nostr-bound music discovery app by [SIVYIS Corp](https://sivyis.net). Genres are nebulae, artists are stars, and a Philosophy / Music History section explains the ideas behind music.

**Live demo:** https://casblu.github.io/galaxy-music-app/

## Status (honest)

This is an early **demo**.

- The Bitcoin wallet is **simulated**: balances live only in your browser's `localStorage`. No real money or keys are involved.
- Built-in artists are **sample content** with generated cues. On top of that, an **open catalog** of real independent artists is loaded from two sources (`npm run catalog` → `src/openCatalog.json`):
  - **V4V / Podcasting 2.0 music RSS** (`podcast:medium=music`), parsing `podcast:value` / `valueRecipient` Lightning splits. With `PODCASTINDEX_API_KEY` + `PODCASTINDEX_API_SECRET` set, feeds come from Podcast Index `podcasts/bymedium?medium=music`; without a key, feeds are discovered via Wavlake's public rankings → `wavlake.com/feed/music/<album>`.
  - **Nostr music events** from public relays: kinds 36787, 30440 (Wavlake draft music NIP) and audio-only 31337, plus kind 0 profiles for `lud16` zap addresses.
  - Artists in both sources are merged by name. Pay targets are displayed only; no payments are made. `npm test` checks parsing + live loading.
- **Nostr login, artist releases as Nostr events, and Lightning zaps are planned, not built.**
- Some philosopher portraits are placeholders pending a license check (see `ATTRIBUTIONS.md`).

## Run / build

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + build to dist/
```

The live site is served by GitHub Pages from `docs/` on `main`. To update it:

```bash
npm run build && rm -rf docs/* && cp -r dist/. docs/ && cp docs/index.html docs/404.html && touch docs/.nojekyll
```

Stack: TypeScript, Vite, three.js.

## Licenses

- Code: [AGPL-3.0](LICENSE)
- Our Music History / Philosophy text: CC BY-SA 4.0, see [CONTENT-LICENSE.md](CONTENT-LICENSE.md)
- Third-party assets: see [ATTRIBUTIONS.md](ATTRIBUTIONS.md)
