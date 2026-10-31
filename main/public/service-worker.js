// sw.js — Service Worker
// Strategy:
//   • Online  → network-first: always serve the newest version, update cache in
//               the background. Cache is only a fallback for when you're offline.
//   • Offline → serve from cache if we have it.
//   • Updates → the new SW activates automatically once every tab of this site
//               is closed (no forced skipWaiting), so open tabs are never yanked
//               onto a half-loaded new version mid-session.

const VERSION = '2.0.0';
const CACHE = 'app-' + VERSION + '-' + self.location.pathname.replace(/[^a-zA-Z0-9_-]/g, '-');

// Core files to pre-cache on install (so the site works offline from first visit).
// The JS bundle is hashed by Vite, so it can't be listed here — network-first
// picks it up on the first visit and keeps it for offline use.
const PRECACHE = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./styles.css",
    "./training-modal.css",
    "./quick-edit.css",
    "./svg-editor.css",
    "./res/icons/icon-32.png",
    "./res/icons/icon-16.png",
    "./favicon.ico"
];

// ── WHAT TO CACHE ────────────────────────────────────────────────────────────
// Default: cache every same-origin file whose extension is in CACHE_FILE_TYPES.
//   • BLACKLIST  → never cache these (even if the type matches).
//   • WHITELIST  → always cache these (even if the type does NOT match).
// BLACKLIST / WHITELIST entries are root-relative paths and may be either a
// single file ('tools/foo/data.bin') or a folder ('tools/foo' → everything
// under it). Leading slashes are optional.

const CACHE_FILE_TYPES = [
    'html', 'htm', 'css', 'js', 'mjs', 'json',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico',
    'woff', 'woff2', 'ttf', 'webmanifest',
];

const BLACKLIST = [
];

const WHITELIST = [
];

// Strip a leading slash and trailing slash so comparisons are consistent.
function normalize(path) {
    return path.replace(/^\/+/,'').replace(/\/+$/,'');
}

// Does `path` match a blacklist/whitelist entry (exact file OR inside a folder)?
function pathMatches(path, entry) {
    const p = normalize(path);
    const e = normalize(entry);
    return p === e || p.startsWith(e + '/');
}

function extensionOf(path) {
    const name = path.split('/').pop() || '';
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

// Decide whether a same-origin request should be cached.
function shouldCache(pathname) {
    // Blacklist always wins.
    if (BLACKLIST.some(entry => pathMatches(pathname, entry))) return false;
    // Whitelist forces caching regardless of file type.
    if (WHITELIST.some(entry => pathMatches(pathname, entry))) return true;
    // Otherwise cache only known file types.
    return CACHE_FILE_TYPES.includes(extensionOf(pathname));
}

// ── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
    );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // Same-origin requests that we don't want to cache → straight to network.
    if (sameOrigin && !shouldCache(url.pathname)) return;

    event.respondWith(networkFirst(request));
});

// ── STRATEGY ─────────────────────────────────────────────────────────────────
// Network-first: when online you always get the newest version; the fresh copy
// is written to the cache so it's there if you go offline later.
async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request);
        // Cache successful (or opaque cross-origin) responses for offline use.
        if (response && (response.ok || response.type === 'opaque')) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await cache.match(request);
        return cached ?? new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
        });
    }
}
