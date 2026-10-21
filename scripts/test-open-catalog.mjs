// node scripts/test-open-catalog.mjs  → unit tests (offline) + live load from both sources
import assert from 'node:assert/strict'
import { parseFeed, parseTrackEvent, normalize, mapGenre, loadRss, loadNostr } from './open-catalog-lib.mjs'

const FEED = `<?xml version="1.0"?><rss xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>Album X</title><itunes:author>Test Band</itunes:author><podcast:medium>music</podcast:medium>
<podcast:category text="Rock"><podcast:category text="Punk"/></podcast:category>
<podcast:value type="lightning" method="keysend"><podcast:valueRecipient name="Band" type="node" address="02abc" split="95"/><podcast:valueRecipient name="App" type="node" address="03def" split="5" fee="true"/></podcast:value>
<item><title>Song A</title><itunes:duration>3:05</itunes:duration><enclosure url="https://x.test/a.mp3" type="audio/mpeg"/></item></channel></rss>`
const f = parseFeed(FEED, 'https://x.test/feed')
assert.equal(f.artist, 'Test Band'); assert.equal(f.tracks[0].duration, '3:05'); assert.equal(f.value.recipients.length, 2); assert.equal(f.value.recipients[0].split, 95)
const ev = { kind: 36787, pubkey: 'pk1', created_at: 1, content: '', tags: [['d', '1'], ['title', 'Song B'], ['artist', 'test band'], ['url', 'https://x.test/b.mp3'], ['t', 'music'], ['duration', '200'], ['zap', 'pk1', 'wss://r', '1']] }
const t = parseTrackEvent(ev); assert.equal(t.title, 'Song B'); assert.equal(t.duration, '3:20')
assert.equal(parseTrackEvent({ ...ev, kind: 31337, tags: [['d', 'x'], ['title', 'Tetris'], ['url', 'https://x.test/score']] }), null)
const merged = normalize({ rss: { feeds: [f] }, nostr: { tracks: [t], profiles: { pk1: { name: 'Test Band', lud16: 'band@getalby.com' } } } })
assert.equal(merged.length, 1, 'dedupes artist present in both sources')
assert.deepEqual(merged[0].sources, ['rss', 'nostr']); assert.equal(merged[0].pay.lud16, 'band@getalby.com'); assert.equal(merged[0].tracks.length, 2)
assert.equal(mapGenre(['Punk']).genreId, 'rock')
console.log('unit tests: OK')

if (!process.argv.includes('--offline')) {
  const [rss, nostr] = await Promise.all([loadRss({ max: 20 }), loadNostr()])
  const live = normalize({ rss, nostr })
  const r = live.filter((a) => a.sources.includes('rss')), n = live.filter((a) => a.sources.includes('nostr'))
  console.log(`live: ${rss.feeds.length} V4V feeds (${rss.via}) → ${r.length} RSS artists; ${nostr.tracks.length} Nostr tracks → ${n.length} Nostr artists`)
  console.log('  e.g. RSS:', r.slice(0, 3).map((a) => `${a.name} (${a.tracks.length} tracks, ${a.pay.valueSplits?.recipients.length ?? 0} splits)`).join('; '))
  console.log('  e.g. Nostr:', n.slice(0, 3).map((a) => `${a.name} (${a.tracks.length} tracks, zap ${a.pay.lud16 || 'none'})`).join('; '))
  assert.ok(r.length > 0 && r.every((a) => a.tracks.every((x) => x.audioUrl)), 'real RSS artists with audio')
  assert.ok(n.length > 0 && n.every((a) => a.tracks.every((x) => x.audioUrl)), 'real Nostr artists with audio')
  console.log('live tests: OK')
}
