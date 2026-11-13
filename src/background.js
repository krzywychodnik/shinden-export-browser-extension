import { matchAnimeToMal, searchAniList, searchJikan } from './matcher.js';

const CACHE_KEY = 'malMatchCache_v1';
const STATE_KEY = 'shindenExporterState_v1';
const JOB_KEY = 'shindenMatchJob_v1';
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

async function setJobState(job) {
  await chrome.storage.local.set({ [JOB_KEY]: job });
}

function getCacheKey(entry) {
  return entry.shindenId
    ? `id:${entry.shindenId}`
    : `title:${String(entry.title ?? '').trim().toLowerCase()}`;
}

async function updateBadge(text, color = '#3b82f6') {
  try {
    await chrome.action.setBadgeText({ text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch {
    // Ignore badge errors
  }
}

async function matchListInBackground(entries, userName) {
  const cache = await getCache();
  const results = [];
  let cacheDirty = false;

  await setJobState({
    status: 'running',
    current: 0,
    total: entries.length,
    lastTitle: '',
    error: null,
  });
  await updateBadge('0%', '#3b82f6');

  try {
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

      const current = i + 1;
      const pct = entries.length > 0 ? Math.round((current / entries.length) * 100) : 100;

      // Persist progress and partial results periodically so popup can close safely
      await setJobState({
        status: 'running',
        current,
        total: entries.length,
        lastTitle: entry.title,
        error: null,
      });

      if (current % 10 === 0 || current === entries.length) {
        await chrome.storage.local.set({
          [STATE_KEY]: {
            userName: userName || 'ShindenUser',
            entries: results.concat(entries.slice(results.length)),
          },
        });
        if (cacheDirty) {
          await saveCache(cache);
          cacheDirty = false;
        }
      }

      await updateBadge(`${pct}%`, '#3b82f6');
    }

    if (cacheDirty) {
      await saveCache(cache);
    }

    await chrome.storage.local.set({
      [STATE_KEY]: {
        userName: userName || 'ShindenUser',
        entries: results,
      },
    });

    await setJobState({
      status: 'done',
      current: entries.length,
      total: entries.length,
      lastTitle: '',
      error: null,
    });
    await updateBadge('OK', '#10b981');
  } catch (err) {
    await setJobState({
      status: 'error',
      current: results.length,
      total: entries.length,
      lastTitle: '',
      error: err.message,
    });
    await updateBadge('ERR', '#ef4444');
  }
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
  if (message?.type === 'START_MATCH_JOB') {
    matchListInBackground(message.entries ?? [], message.userName);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'CLEAR_BADGE') {
    updateBadge('');
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'SEARCH_MAL_CANDIDATES') {
    searchManualCandidates(message.query ?? '')
      .then((candidates) => sendResponse({ ok: true, candidates }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});
