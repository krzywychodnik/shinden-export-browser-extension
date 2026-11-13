/**
 * Title normalization, fuzzy matching, and MAL ID lookup via AniList GraphQL + Jikan v4 fallback.
 */

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const JIKAN_ENDPOINT = 'https://api.jikan.moe/v4/anime';

const ANILIST_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 8) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      idMal
      format
      episodes
      title {
        romaji
        english
        native
      }
      synonyms
    }
  }
}
`;

/**
 * Normalizes an anime title for comparison.
 * @param {string} title
 * @returns {string}
 */
export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’"`´]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Sorensen-Dice bigram similarity between two strings (0..1).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function titleSimilarity(a, b) {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.length < 2 || normB.length < 2) {
    return normA === normB ? 1 : 0;
  }

  const bigramsA = new Map();
  for (let i = 0; i < normA.length - 1; i += 1) {
    const gram = normA.slice(i, i + 2);
    bigramsA.set(gram, (bigramsA.get(gram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < normB.length - 1; i += 1) {
    const gram = normB.slice(i, i + 2);
    const count = bigramsA.get(gram) ?? 0;
    if (count > 0) {
      bigramsA.set(gram, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (normA.length - 1 + (normB.length - 1));
}

/**
 * Picks the best candidate from a list of MAL-mapped candidates.
 * @param {string} queryTitle
 * @param {Array<{
 *   malId: number,
 *   titles: string[],
 *   primaryTitle: string,
 *   type?: string,
 *   episodes?: number,
 * }>} candidates
 * @param {{ expectedType?: string, expectedEpisodes?: number }} [hints]
 * @returns {{ malId: number, malTitle: string, confidence: number, type?: string, episodes?: number } | null}
 */
export function pickBestCandidate(queryTitle, candidates, hints = {}) {
  let best = null;

  for (const candidate of candidates) {
    if (!candidate.malId || candidate.malId <= 0) continue;

    let maxSim = 0;
    for (const t of candidate.titles) {
      if (!t) continue;
      const sim = titleSimilarity(queryTitle, t);
      if (sim > maxSim) maxSim = sim;
    }

    let score = maxSim;
    if (
      hints.expectedType &&
      candidate.type &&
      hints.expectedType.toUpperCase() === candidate.type.toUpperCase()
    ) {
      score += 0.03;
    }
    if (
      hints.expectedEpisodes &&
      hints.expectedEpisodes > 0 &&
      candidate.episodes &&
      hints.expectedEpisodes === candidate.episodes
    ) {
      score += 0.03;
    }

    const clamped = Math.min(1, score);
    if (!best || clamped > best.confidence) {
      best = {
        malId: candidate.malId,
        malTitle: candidate.primaryTitle,
        confidence: Number(clamped.toFixed(3)),
        type: candidate.type,
        episodes: candidate.episodes ?? 0,
      };
    }
  }

  return best;
}

function mapAniListFormat(format) {
  switch (format) {
    case 'TV':
    case 'TV_SHORT':
      return 'TV';
    case 'MOVIE':
      return 'Movie';
    case 'SPECIAL':
      return 'Special';
    case 'OVA':
      return 'OVA';
    case 'ONA':
      return 'ONA';
    case 'MUSIC':
      return 'Music';
    default:
      return 'TV';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fetch(url, options);
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = Number.parseInt(res.headers.get('Retry-After') ?? '2', 10);
      await sleep(Math.max(1, retryAfter) * 1000);
      continue;
    }
    return res;
  }
  throw new Error('Max retries exceeded');
}

/**
 * Queries AniList GraphQL API for a title and returns normalized candidates with `malId`.
 * @param {string} title
 * @returns {Promise<Array>}
 */
export async function searchAniList(title) {
  const res = await fetchWithRetry(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: { search: title },
    }),
  });

  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`);
  }

  const json = await res.json();
  const mediaList = json?.data?.Page?.media ?? [];
  return mediaList
    .filter((m) => Number.isInteger(m?.idMal) && m.idMal > 0)
    .map((m) => {
      const titles = [
        m.title?.romaji,
        m.title?.english,
        m.title?.native,
        ...(Array.isArray(m.synonyms) ? m.synonyms : []),
      ].filter(Boolean);
      return {
        malId: m.idMal,
        primaryTitle: m.title?.romaji || m.title?.english || titles[0] || '',
        titles,
        type: mapAniListFormat(m.format),
        episodes: m.episodes ?? 0,
      };
    });
}

/**
 * Queries Jikan API v4 as fallback when AniList yields no `idMal` match.
 * @param {string} title
 * @returns {Promise<Array>}
 */
export async function searchJikan(title) {
  const url = `${JIKAN_ENDPOINT}?q=${encodeURIComponent(title)}&limit=6`;
  const res = await fetchWithRetry(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Jikan HTTP ${res.status}`);
  }

  const json = await res.json();
  const items = json?.data ?? [];
  return items
    .filter((item) => Number.isInteger(item?.mal_id) && item.mal_id > 0)
    .map((item) => {
      const titles = [
        item.title,
        item.title_english,
        item.title_japanese,
        ...(Array.isArray(item.title_synonyms) ? item.title_synonyms : []),
      ].filter(Boolean);
      return {
        malId: item.mal_id,
        primaryTitle: item.title || item.title_english || '',
        titles,
        type: item.type || 'TV',
        episodes: item.episodes ?? 0,
      };
    });
}

/**
 * Resolves a single Shinden anime entry to its best MAL match.
 * @param {{ title: string, type?: string, totalEpisodes?: number }} entry
 * @returns {Promise<{ malId: number | null, malTitle: string, confidence: number, source: string, type?: string, episodes?: number }>}
 */
export async function matchAnimeToMal(entry) {
  const hints = {
    expectedType: entry.type,
    expectedEpisodes: entry.totalEpisodes,
  };

  try {
    const aniCandidates = await searchAniList(entry.title);
    const bestAni = pickBestCandidate(entry.title, aniCandidates, hints);
    if (bestAni && bestAni.confidence >= 0.72) {
      return { ...bestAni, source: 'anilist' };
    }

    // Fallback to Jikan if AniList didn't find a confident match
    const jikanCandidates = await searchJikan(entry.title);
    const bestJikan = pickBestCandidate(entry.title, jikanCandidates, hints);

    if (bestJikan && (!bestAni || bestJikan.confidence > bestAni.confidence)) {
      return { ...bestJikan, source: 'jikan' };
    }
    if (bestAni) {
      return { ...bestAni, source: 'anilist' };
    }
  } catch (err) {
    // Try Jikan if AniList failed outright
    try {
      const jikanCandidates = await searchJikan(entry.title);
      const bestJikan = pickBestCandidate(entry.title, jikanCandidates, hints);
      if (bestJikan) {
        return { ...bestJikan, source: 'jikan' };
      }
    } catch {
      return {
        malId: null,
        malTitle: '',
        confidence: 0,
        source: `error: ${err.message}`,
      };
    }
  }

  return {
    malId: null,
    malTitle: '',
    confidence: 0,
    source: 'unmatched',
  };
}
