// Cosmoly open catalog: V4V / Podcasting 2.0 music RSS + Nostr music events → one artist model.
import WebSocket from 'ws'
import { XMLParser } from 'fast-xml-parser'
import crypto from 'node:crypto'

export const UA = 'Cosmoly/1.0 (+https://casblu.github.io/galaxy-music-app; SIVYIS Corp catalog builder)'
export const RELAYS = ['wss://relay.wavlake.com', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.damus.io']
// Nostr music kinds seen live on public relays (checked Oct 2026):
// 36787 = most consistent music track kind (title/url/artist/duration tags; Amethyst, Nostria, 2140.wtf...)
// 30440 = Wavlake's draft "Music Metadata" NIP track kind (stream_url / audio tags)
// 31337 = legacy/zapstr + lightning.fm track kind (heavily shared with non-music apps → filtered to audio)
export const MUSIC_KINDS = [36787, 30440, 31337]

const GENRE_SUBS = {
  hiphop: ['Boom Bap', 'Trap', 'Conscious', 'Drill', 'Alternative Rap'],
  pop: ['Dance Pop', 'Synth Pop', 'Teen Pop', 'Art Pop', 'Electropop'],
  rock: ['Classic Rock', 'Alternative', 'Punk', 'Indie Rock', 'Progressive'],
  rnb: ['Neo-Soul', 'Contemporary R&B', 'Quiet Storm', 'Funk', 'Gospel-Soul'],
  electronic: ['House', 'Techno', 'Ambient', 'Drum & Bass', 'Synthwave'],
  jazz: ['Bebop', 'Cool', 'Fusion', 'Vocal Jazz', 'Contemporary'],
  latin: ['Reggaeton', 'Salsa', 'Latin Pop', 'Brazilian', 'Regional Mexican'],
  country: ['Contemporary', 'Outlaw', 'Americana', 'Country Pop', 'Bluegrass-tinged'],
  indie: ['Indie Pop', 'Dream Pop', 'Post-Punk', 'Singer-Songwriter', 'Chamber'],
  metal: ['Thrash', 'Doom', 'Nu-Metal', 'Prog Metal', 'Industrial'],
}
const subId = (g, n) => g + '-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// keyword → [genre, subgenre index]
const RULES = [
  [/metal|thrash|doom|djent|hardcore/, 'metal', 0], [/industrial/, 'metal', 4],
  [/hip.?hop|rap|trap|boom.?bap|drill/, 'hiphop', 0], [/conscious/, 'hiphop', 2],
  [/r&b|rnb|soul|funk|gospel/, 'rnb', 0],
  [/jazz|bebop|swing|blues/, 'jazz', 4], [/fusion/, 'jazz', 2],
  [/reggaeton|salsa|latin|bossa|samba|cumbia|brazil|reggae|dub|world|afro/, 'latin', 3],
  [/country|americana|bluegrass|folk|acoustic/, 'country', 2],
  [/ambient|chill|lo.?fi|downtempo|meditat/, 'electronic', 2], [/house|dance|edm|disco/, 'electronic', 0],
  [/techno|trance/, 'electronic', 1], [/drum.?(and|&|n).?bass|dnb|jungle|bass/, 'electronic', 3],
  [/synthwave|electro|electronic|idm|chiptune|8.?bit/, 'electronic', 4],
  [/punk/, 'rock', 2], [/prog/, 'rock', 4], [/classic rock|soft rock/, 'rock', 0], [/rock|grunge|alternative/, 'rock', 1],
  [/dream.?pop|shoegaze/, 'indie', 1], [/singer|songwriter/, 'indie', 3], [/post.?punk/, 'indie', 2],
  [/classical|orchestral|chamber|piano|instrumental|soundtrack/, 'indie', 4], [/indie|bedroom/, 'indie', 0],
  [/synth.?pop/, 'pop', 1], [/pop/, 'pop', 0],
]
export function mapGenre(tags) {
  const text = tags.filter(Boolean).join(' | ').toLowerCase()
  for (const [re, g, i] of RULES) if (re.test(text)) return { genreId: g, subgenreId: subId(g, GENRE_SUBS[g][i]), matched: true }
  return { genreId: 'indie', subgenreId: subId('indie', 'Indie Pop'), matched: false }
}

export const normName = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
const fmtDur = (sec) => { sec = Math.round(Number(sec) || 0); return sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '' }
const parseDur = (d) => { if (d == null) return 0; const s = String(d); if (s.includes(':')) return s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0); return Number(s) || 0 }
const isAudio = (u) => typeof u === 'string' && /^https?:\/\//.test(u) && (/\.(mp3|m4a|aac|ogg|opus|wav|flac|mpga)(\?|$)/i.test(u) || /audio|stream|track/i.test(u))

// ───────────── RSS / V4V ─────────────
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#t', isArray: (n) => ['item', 'podcast:valueRecipient', 'podcast:category', 'category'].includes(n) })
const txt = (v) => (v == null ? '' : typeof v === 'object' ? String(v['#t'] ?? '') : String(v)).trim()

function parseValue(v) {
  if (!v) return null
  const recips = (v['podcast:valueRecipient'] || []).map((r) => ({
    name: r['@name'] || '', type: r['@type'] || '', address: r['@address'] || '', split: Number(r['@split'] || 0),
    customKey: r['@customKey'], customValue: r['@customValue'], fee: r['@fee'] === 'true',
  })).filter((r) => r.address)
  return recips.length ? { type: v['@type'] || 'lightning', method: v['@method'] || 'keysend', recipients: recips } : null
}

export function parseFeed(body, feedUrl) {
  const ch = xml.parse(body)?.rss?.channel
  if (!ch) throw new Error('not RSS')
  const medium = txt(ch['podcast:medium'])
  const cats = []
  const walk = (arr) => (arr || []).forEach((c) => { cats.push(c['@text']); walk(c['podcast:category']) })
  walk(ch['podcast:category']); walk(ch['itunes:category'])
  const artist = txt(ch['itunes:author']) || txt(ch.author) || txt(ch.title)
  const channelValue = parseValue(ch['podcast:value'])
  const publisher = ch['podcast:remoteItem']?.['@medium'] === 'publisher' ? ch['podcast:remoteItem']['@feedGuid'] : null
  const tracks = (ch.item || []).map((it) => ({
    title: txt(it.title), duration: fmtDur(parseDur(txt(it['itunes:duration']))), audioUrl: it.enclosure?.['@url'] || '',
    source: 'rss', value: parseValue(it['podcast:value']) || channelValue,
  })).filter((t) => t.audioUrl)
  return {
    medium, artist, album: txt(ch.title), feedUrl, link: txt(ch.link), publisherGuid: publisher,
    image: ch['itunes:image']?.['@href'] || txt(ch.image?.url), description: txt(ch.description).slice(0, 400),
    categories: cats.filter(Boolean), value: channelValue, tracks,
  }
}

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}

/** Feed discovery. With a Podcast Index key → /podcasts/bymedium?medium=music. Without → Wavlake's public rankings → their V4V RSS feeds. */
export async function discoverMusicFeeds({ max = 60, extra = [] } = {}) {
  const key = process.env.PODCASTINDEX_API_KEY, secret = process.env.PODCASTINDEX_API_SECRET
  if (key && secret) {
    const t = Math.floor(Date.now() / 1000)
    const auth = crypto.createHash('sha1').update(key + secret + t).digest('hex')
    const r = await fetch(`https://api.podcastindex.org/api/1.0/podcasts/bymedium?medium=music&max=${max}`, {
      headers: { 'User-Agent': UA, 'X-Auth-Key': key, 'X-Auth-Date': String(t), Authorization: auth },
    })
    const j = await r.json()
    return { via: 'podcastindex-api', urls: [...extra, ...(j.feeds || []).map((f) => f.url)] }
  }
  const rank = []
  for (const days of [7, 30, 365]) {
    try { rank.push(...JSON.parse(await getText(`https://wavlake.com/api/v1/content/rankings?sort=sats&days=${days}&limit=100`))) } catch {}
  }
  const albums = [...new Set(rank.map((x) => x.albumId))].slice(0, max)
  return { via: 'wavlake-public-rankings (no Podcast Index key)', urls: [...extra, ...albums.map((a) => `https://wavlake.com/feed/music/${a}`)] }
}

export async function loadRss(opts = {}) {
  const { via, urls } = await discoverMusicFeeds(opts)
  const feeds = []
  const errors = []
  const queue = [...urls]
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const u = queue.shift()
      try { const f = parseFeed(await getText(u), u); if (!f.medium || f.medium === 'music') feeds.push(f) } catch (e) { errors.push(String(e.message || e)) }
    }
  }))
  return { via, feeds, errors }
}

// ───────────── Nostr ─────────────
export function queryRelay(relay, filter, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const out = []
    let ws
    const done = () => { try { ws.close() } catch {} resolve(out) }
    const t = setTimeout(done, timeoutMs)
    try { ws = new WebSocket(relay, { headers: { 'User-Agent': UA } }) } catch { clearTimeout(t); return resolve(out) }
    ws.on('open', () => ws.send(JSON.stringify(['REQ', 'c', filter])))
    ws.on('message', (d) => { try { const m = JSON.parse(d); if (m[0] === 'EVENT') out.push(m[2]); if (m[0] === 'EOSE' || m[0] === 'CLOSED') { clearTimeout(t); done() } } catch {} })
    ws.on('error', () => { clearTimeout(t); done() })
  })
}
async function queryAll(filter) {
  const res = await Promise.all(RELAYS.map((r) => queryRelay(r, filter)))
  const byId = new Map(); res.flat().forEach((e) => byId.set(e.id, e)); return [...byId.values()]
}
const tag = (e, n) => e.tags.find((t) => t[0] === n)?.[1]
const tags = (e, n) => e.tags.filter((t) => t[0] === n).map((t) => t[1])

export function parseTrackEvent(e) {
  let c = {}
  if (e.content && e.content.trim().startsWith('{')) { try { c = JSON.parse(e.content) } catch {} }
  const imeta = e.tags.find((t) => t[0] === 'imeta')?.slice(1).find((x) => x.startsWith('url '))?.slice(4)
  const url = [tag(e, 'url'), tag(e, 'stream_url'), tag(e, 'audio'), tag(e, 'media'), imeta, c.audio_url, c.stream_url].find(isAudio)
  const title = tag(e, 'title') || c.title
  if (!url || !title) return null
  if (e.kind === 31337 && !(tags(e, 't').includes('music') || /audio/.test(tag(e, 'm') || '') || tag(e, 'artist'))) return null
  if (tag(e, 'access_mode') === 'paywall') return null // preview-only; skip for now
  const zap = e.tags.filter((t) => t[0] === 'zap').map((t) => ({ pubkey: t[1], relay: t[2], weight: Number(t[3] || 1) }))
  return {
    kind: e.kind, pubkey: e.pubkey, d: tag(e, 'd'), title, artist: tag(e, 'artist') || c.artist || '', album: tag(e, 'album') || c.album || '',
    audioUrl: url, duration: fmtDur(tag(e, 'duration') || c.duration), image: tag(e, 'image') || c.artwork_url || c.image_url || '',
    genres: [...tags(e, 't').filter((t) => t !== 'music'), c.genre].filter(Boolean), zapSplits: zap, created_at: e.created_at,
  }
}

export async function loadNostr() {
  const evs = await queryAll({ kinds: MUSIC_KINDS, limit: 500 })
  const latest = new Map()
  for (const e of evs) { const k = `${e.kind}:${e.pubkey}:${tag(e, 'd')}`; if (!latest.has(k) || latest.get(k).created_at < e.created_at) latest.set(k, e) }
  const tracks = [...latest.values()].map(parseTrackEvent).filter(Boolean)
  const pubkeys = [...new Set(tracks.map((t) => t.pubkey))]
  const profiles = {}
  for (let i = 0; i < pubkeys.length; i += 100) {
    for (const p of await queryAll({ kinds: [0], authors: pubkeys.slice(i, i + 100) })) {
      try { const m = JSON.parse(p.content); if (!profiles[p.pubkey] || profiles[p.pubkey].at < p.created_at) profiles[p.pubkey] = { ...m, at: p.created_at } } catch {}
    }
  }
  return { rawEvents: evs.length, tracks, profiles }
}

// ───────────── Normalize + dedupe ─────────────
function hashOffset(s) {
  const h = crypto.createHash('md5').update(s).digest()
  return [0, 1, 2].map((i) => Number(((h[i] / 255) * 1.6 - 0.8).toFixed(3)))
}

export function normalize({ rss, nostr, maxTracks = 8 }) {
  const artists = new Map() // normName → artist
  const get = (name) => {
    const k = normName(name)
    if (!artists.has(k)) artists.set(k, { key: k, name: name.trim(), sources: [], tags: [], tracks: [], bio: '', image: '', links: [], pay: { valueSplits: null, lud16: null, nostrPubkey: null, zapSplits: [] } })
    return artists.get(k)
  }
  for (const f of rss.feeds) {
    if (!f.artist || !f.tracks.length) continue
    const a = get(f.artist)
    if (!a.sources.includes('rss')) a.sources.push('rss')
    a.tags.push(...f.categories); a.image ||= f.image; a.bio ||= f.description
    a.links.push({ label: `RSS feed: ${f.album}`, url: f.feedUrl }); if (f.link) a.links.push({ label: 'Artist page', url: f.link })
    a.pay.valueSplits ||= f.value
    for (const t of f.tracks) a.tracks.push({ title: t.title, duration: t.duration, audioUrl: t.audioUrl, source: 'rss', album: f.album })
  }
  for (const t of nostr.tracks) {
    const p = nostr.profiles[t.pubkey] || {}
    const name = t.artist || p.display_name || p.name
    if (!name || !normName(name)) continue
    const a = get(name)
    if (!a.sources.includes('nostr')) a.sources.push('nostr')
    a.tags.push(...t.genres); a.image ||= p.picture || t.image; a.bio ||= (p.about || '').slice(0, 400)
    a.pay.nostrPubkey ||= t.pubkey; a.pay.lud16 ||= p.lud16 || null
    if (t.zapSplits.length && !a.pay.zapSplits.length) a.pay.zapSplits = t.zapSplits
    if (!a.tracks.some((x) => normName(x.title) === normName(t.title))) a.tracks.push({ title: t.title, duration: t.duration, audioUrl: t.audioUrl, source: 'nostr', album: t.album })
  }
  const out = []
  for (const a of artists.values()) {
    if (!a.tracks.length) continue
    const g = mapGenre(a.tags)
    a.links = a.links.filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i).slice(0, 4)
    if (a.pay.nostrPubkey) a.links.push({ label: 'Nostr profile', url: `https://njump.me/${a.pay.nostrPubkey}` })
    out.push({
      id: 'open-' + (a.key || crypto.createHash('md5').update(a.name).digest('hex').slice(0, 10)),
      name: a.name, sources: a.sources, genreId: g.genreId, subgenreId: g.subgenreId, genreTags: [...new Set(a.tags)].slice(0, 6),
      bio: a.bio || `Independent artist from the open Bitcoin music web (${a.sources.join(' + ')}).`,
      image: a.image, links: a.links, pay: a.pay, tracks: a.tracks.slice(0, maxTracks), offset: hashOffset(a.key),
    })
  }
  return out
}
