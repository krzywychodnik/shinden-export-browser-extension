import { matchAnimeToMal, searchAniList, searchJikan } from './matcher.js';

const CACHE_KEY = 'malMatchCache_v1';
const REQUEST_DELAY_MS = 700;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCache() {
  const data = await chrome.storage.local.get(CACHE_KEY);
  return data[CACHE_KEY] ?? {};
}

async function saveCache(cache) {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

function getCacheKey(entry) {
  return entry.shindenId
    ? `id:${entry.shindenId}`
    : `title:${String(entry.title ?? '').trim().toLowerCase()}`;
}

async function matchList(entries) {
  const cache = await getCache();
  const results = [];
  let cacheDirty = false;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const key = getCacheKey(entry);

    let match = cache[key];
    if (!match || !match.malId) {
      match = await matchAnimeToMal(entry);
      if (match.malId) {
        cache[key] = match;
        cacheDirty = true;
      }
      if (i < entries.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    const enriched = {
      ...entry,
      malId: match.malId ?? null,
      malTitle: match.malTitle ?? '',
      confidence: match.confidence ?? 0,
      matchSource: match.source ?? 'unmatched',
      type: entry.type || match.type || 'TV',
      totalEpisodes: entry.totalEpisodes || match.episodes || 0,
    };
    results.push(enriched);

    chrome.runtime
      .sendMessage({
        type: 'MATCH_PROGRESS',
        current: i + 1,
        total: entries.length,
        lastTitle: entry.title,
      })
      .catch(() => {
        // Popup might be closed; ignore
      });
  }

  if (cacheDirty) {
    await saveCache(cache);
  }

  return results;
}

async function searchManualCandidates(query) {
  const results = [];
  const seenIds = new Set();

  try {
    const ani = await searchAniList(query);
    for (const item of ani) {
      if (!seenIds.has(item.malId)) {
        seenIds.add(item.malId);
        results.push({ ...item, source: 'anilist' });
      }
    }
  } catch {
    // Fallback to Jikan below
  }

  if (results.length < 3) {
    try {
      const jikan = await searchJikan(query);
      for (const item of jikan) {
        if (!seenIds.has(item.malId)) {
          seenIds.add(item.malId);
          results.push({ ...item, source: 'jikan' });
        }
      }
    } catch {
      // Ignore
    }
  }

  return results.slice(0, 8);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'MATCH_ANIME_LIST') {
    matchList(message.entries ?? [])
      .then((matched) => sendResponse({ ok: true, entries: matched }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === 'SEARCH_MAL_CANDIDATES') {
    searchManualCandidates(message.query ?? '')
      .then((candidates) => sendResponse({ ok: true, candidates }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});
