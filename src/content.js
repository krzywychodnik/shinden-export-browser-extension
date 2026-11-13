/**
 * Content script for https://lista.shinden.pl/animelist/*
 * Fetches all anime list statuses via Shinden's JSON API:
 *   /api/userlist/{userId}/anime/{status}?limit=100&offset={offset}
 * with DOM fallback for `li.cell-tile-item`.
 */

const API_STATUSES = [
  { slug: 'in-progress', malStatus: 'Watching' },
  { slug: 'completed', malStatus: 'Completed' },
  { slug: 'hold', malStatus: 'On-Hold' },
  { slug: 'dropped', malStatus: 'Dropped' },
  { slug: 'plan', malStatus: 'Plan to Watch' },
];

const PAGE_LIMIT = 30;

function mapApiWatchStatus(rawStatus, fallbackStatus) {
  if (!rawStatus) return fallbackStatus;
  const s = String(rawStatus).trim().toLowerCase();
  if (s === 'in progress' || s === 'in-progress' || s === 'in_progress' || s === 'watching') {
    return 'Watching';
  }
  if (s === 'completed') return 'Completed';
  if (s === 'hold' || s === 'on-hold' || s === 'on hold') return 'On-Hold';
  if (s === 'dropped') return 'Dropped';
  if (s === 'plan' || s === 'plan to watch' || s === 'planning') return 'Plan to Watch';
  return fallbackStatus;
}

function parseIntSafe(value) {
  if (value === null || value === undefined || value === '' || value === '-') return 0;
  const num = Number.parseInt(String(value), 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function extractUserInfo() {
  const pathMatch = window.location.pathname.match(/\/animelist\/(\d+)(?:-([^/]+))?/i);
  return {
    userId: pathMatch ? pathMatch[1] : null,
    userName: pathMatch?.[2] ? decodeURIComponent(pathMatch[2]) : 'ShindenUser',
  };
}

async function fetchStatusFromApi(userId, slug, fallbackMalStatus, traceList) {
  const collected = [];
  let offset = 0;

  while (true) {
    const url = `${window.location.origin}/api/userlist/${userId}/anime/${slug}?limit=${PAGE_LIMIT}&offset=${offset}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      traceList.push({ slug, offset, httpStatus: res.status, ok: false });
      throw new Error(`HTTP ${res.status} for ${slug}`);
    }

    const json = await res.json();
    const items = json?.result?.items;
    const totalCount = Number(json?.result?.count ?? 0);

    if (offset === 0) {
      traceList.push({
        slug,
        httpStatus: res.status,
        success: json?.success,
        message: json?.message,
        count: json?.result?.count,
        itemsIsArray: Array.isArray(items),
        itemsLen: Array.isArray(items) ? items.length : null,
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      break;
    }

    for (const item of items) {
      collected.push({
        shindenId: String(item.titleId ?? ''),
        title: String(item.title ?? '').trim(),
        status: mapApiWatchStatus(item.watchStatus, fallbackMalStatus),
        score: parseIntSafe(item.rateTotal),
        watchedEpisodes: parseIntSafe(item.watchedEpisodesCnt),
        totalEpisodes: parseIntSafe(item.episodes),
        type: item.animeType || 'TV',
        shindenUrl: item.titleId ? `https://shinden.pl/series/${item.titleId}` : '',
      });
    }

    offset += items.length;
    if (totalCount > 0 && offset >= totalCount) {
      break;
    }
    if (items.length < PAGE_LIMIT) {
      break;
    }
  }

  return collected;
}

function parseDomFallback() {
  const entries = [];
  const tiles = document.querySelectorAll('li.cell-tile-item');

  for (const tile of tiles) {
    const link = tile.querySelector('a.cell-tile-link[href*="/series/"]');
    const titleEl = tile.querySelector('.cell-tile-title');
    if (!link || !titleEl) continue;

    const title = titleEl.textContent.replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const href = link.getAttribute('href') || '';
    const idMatch = href.match(/\/series\/(\d+)/i);
    const epText = tile.querySelector('.cell-tile-episodes')?.textContent || '';
    const epMatch = epText.replace(/\s+/g, '').match(/(\d+)\/(\d+|-)/);
    const rateText = tile.querySelector('.cell-tile-rate')?.textContent || '';

    const wrapperClasses = tile.querySelector('.cell-tile-wrapper')?.className || '';
    let status = 'Plan to Watch';
    if (/\bin-progress\b/i.test(wrapperClasses)) status = 'Watching';
    else if (/\bcompleted\b/i.test(wrapperClasses)) status = 'Completed';
    else if (/\bhold\b/i.test(wrapperClasses)) status = 'On-Hold';
    else if (/\bdropped\b/i.test(wrapperClasses)) status = 'Dropped';

    entries.push({
      shindenId: idMatch ? idMatch[1] : '',
      title,
      status,
      score: parseIntSafe(rateText),
      watchedEpisodes: epMatch ? parseIntSafe(epMatch[1]) : 0,
      totalEpisodes: epMatch && epMatch[2] !== '-' ? parseIntSafe(epMatch[2]) : 0,
      type: 'TV',
      shindenUrl: href,
    });
  }

  return entries;
}

async function scrapeAllStatuses() {
  const { userId, userName } = extractUserInfo();
  const allEntries = [];
  const seenKeys = new Set();

  const addUnique = (items) => {
    for (const item of items) {
      if (!item.title) continue;
      const key = `${item.shindenId || item.title.toLowerCase()}::${item.status}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      allEntries.push(item);
    }
  };

  const apiErrors = [];
  const apiTrace = [];

  if (userId) {
    for (const { slug, malStatus } of API_STATUSES) {
      try {
        const items = await fetchStatusFromApi(userId, slug, malStatus, apiTrace);
        addUnique(items);
      } catch (err) {
        apiErrors.push(`${slug}: ${err.message}`);
      }
    }
  }

  // Fallback to currently rendered DOM tiles if API yielded nothing
  const domTileCount = document.querySelectorAll('li.cell-tile-item').length;
  if (allEntries.length === 0) {
    addUnique(parseDomFallback());
  }

  return {
    userName,
    entries: allEntries,
    apiErrors,
    debug: {
      href: window.location.href,
      userId,
      userName,
      domTileCount,
      apiTrace,
      apiErrors,
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SCRAPE_SHINDEN_LIST') {
    scrapeAllStatuses()
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  return false;
});
