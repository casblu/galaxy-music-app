// Usage: node scripts/build-open-catalog.mjs   (optional env PODCASTINDEX_API_KEY / PODCASTINDEX_API_SECRET)
import fs from 'node:fs'
import { loadRss, loadNostr, normalize } from './open-catalog-lib.mjs'
const MAX_ARTISTS = Number(process.env.MAX_OPEN_ARTISTS || 160)
const [rss, nostr] = await Promise.all([loadRss({ max: 80 }), loadNostr()])
let artists = normalize({ rss, nostr })
// keep a balanced mix if we need to trim
artists.sort((a, b) => b.sources.length - a.sources.length || b.tracks.length - a.tracks.length)
artists = artists.slice(0, MAX_ARTISTS)
const stats = {
  builtAt: new Date().toISOString(), rssVia: rss.via, rssFeeds: rss.feeds.length, rssErrors: rss.errors.length,
  nostrEvents: nostr.rawEvents, nostrTracks: nostr.tracks.length, nostrProfiles: Object.keys(nostr.profiles).length,
  artists: artists.length,
  artistsRss: artists.filter((a) => a.sources.includes('rss')).length,
  artistsNostr: artists.filter((a) => a.sources.includes('nostr')).length,
  artistsBoth: artists.filter((a) => a.sources.length > 1).length,
  tracksRss: artists.flatMap((a) => a.tracks).filter((t) => t.source === 'rss').length,
  tracksNostr: artists.flatMap((a) => a.tracks).filter((t) => t.source === 'nostr').length,
}
fs.writeFileSync(new URL('../src/openCatalog.json', import.meta.url), JSON.stringify({ stats, artists }, null, 1))
console.log(stats)
