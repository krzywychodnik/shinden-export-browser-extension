/**
 * Pure utilities for normalizing Shinden statuses/scores/types
 * and generating MyAnimeList-compatible XML export files.
 */

export const MAL_STATUSES = [
  'Watching',
  'Completed',
  'On-Hold',
  'Dropped',
  'Plan to Watch',
];

const STATUS_ALIASES = new Map([
  // English / internal keys
  ['watching', 'Watching'],
  ['in_progress', 'Watching'],
  ['in-progress', 'Watching'],
  ['in progress', 'Watching'],
  ['currently watching', 'Watching'],
  ['completed', 'Completed'],
  ['on-hold', 'On-Hold'],
  ['on hold', 'On-Hold'],
  ['hold', 'On-Hold'],
  ['dropped', 'Dropped'],
  ['plan to watch', 'Plan to Watch'],
  ['plan_to_watch', 'Plan to Watch'],
  ['plantowatch', 'Plan to Watch'],
  ['plan', 'Plan to Watch'],
  ['planning', 'Plan to Watch'],

  // Polish labels commonly used on Shinden
  ['oglądane', 'Watching'],
  ['ogladane', 'Watching'],
  ['w trakcie', 'Watching'],
  ['obejrzane', 'Completed'],
  ['ukończone', 'Completed'],
  ['ukonczone', 'Completed'],
  ['zakończone', 'Completed'],
  ['zakonczone', 'Completed'],
  ['wstrzymane', 'On-Hold'],
  ['porzucone', 'Dropped'],
  ['planowane', 'Plan to Watch'],
  ['do obejrzenia', 'Plan to Watch'],
]);

/**
 * Maps a raw status string from Shinden to a valid MAL `<my_status>` value.
 * Defaults to `'Plan to Watch'` if unrecognized.
 * @param {string | null | undefined} rawStatus
 * @returns {string}
 */
export function normalizeMalStatus(rawStatus) {
  if (!rawStatus) return 'Plan to Watch';
  const cleaned = String(rawStatus).trim().toLowerCase().replace(/\s+/g, ' ');
  return STATUS_ALIASES.get(cleaned) ?? 'Plan to Watch';
}

/**
 * Escapes special XML characters in text nodes.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Clamps a raw score to an integer in 0..10 (0 means unrated in MAL XML).
 * @param {unknown} rawScore
 * @returns {number}
 */
export function normalizeScore(rawScore) {
  if (rawScore === null || rawScore === undefined) return 0;
  const match = String(rawScore).match(/\d+/);
  if (!match) return 0;
  const num = Number.parseInt(match[0], 10);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(10, num);
}

/**
 * Normalizes episode counts to non-negative integers.
 * @param {unknown} rawCount
 * @returns {number}
 */
export function normalizeEpisodes(rawCount) {
  if (rawCount === null || rawCount === undefined) return 0;
  const match = String(rawCount).match(/\d+/);
  if (!match) return 0;
  const num = Number.parseInt(match[0], 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/**
 * Generates a MyAnimeList-compatible XML string from matched anime entries.
 * Entries without a valid positive `malId` are skipped.
 *
 * @param {Array<{
 *   malId: number | string,
 *   title: string,
 *   malTitle?: string,
 *   type?: string,
 *   totalEpisodes?: number,
 *   watchedEpisodes?: number,
 *   score?: number,
 *   status: string,
 * }>} entries
 * @param {{ userName?: string }} [options]
 * @returns {{ xml: string, exportedCount: number, skippedCount: number }}
 */
export function generateMalXml(entries, options = {}) {
  const counts = {
    Watching: 0,
    Completed: 0,
    'On-Hold': 0,
    Dropped: 0,
    'Plan to Watch': 0,
  };

  const validEntries = [];
  let skippedCount = 0;

  for (const entry of entries) {
    const malId = Number.parseInt(String(entry.malId ?? ''), 10);
    if (!Number.isFinite(malId) || malId <= 0) {
      skippedCount += 1;
      continue;
    }

    const status = normalizeMalStatus(entry.status);
    counts[status] += 1;

    const totalEpisodes = normalizeEpisodes(entry.totalEpisodes);
    let watchedEpisodes = normalizeEpisodes(entry.watchedEpisodes);
    if (status === 'Completed' && totalEpisodes > 0 && watchedEpisodes === 0) {
      watchedEpisodes = totalEpisodes;
    }

    validEntries.push({
      malId,
      title: entry.malTitle || entry.title || `Anime #${malId}`,
      type: entry.type || 'TV',
      totalEpisodes,
      watchedEpisodes,
      score: normalizeScore(entry.score),
      status,
    });
  }

  const userName = escapeXml(options.userName || 'ShindenUser');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<myanimelist>',
    '  <myinfo>',
    '    <user_id>0</user_id>',
    `    <user_name>${userName}</user_name>`,
    '    <user_export_type>1</user_export_type>',
    `    <user_total_anime>${validEntries.length}</user_total_anime>`,
    `    <user_total_watching>${counts.Watching}</user_total_watching>`,
    `    <user_total_completed>${counts.Completed}</user_total_completed>`,
    `    <user_total_onhold>${counts['On-Hold']}</user_total_onhold>`,
    `    <user_total_dropped>${counts.Dropped}</user_total_dropped>`,
    `    <user_total_plantowatch>${counts['Plan to Watch']}</user_total_plantowatch>`,
    '  </myinfo>',
  ];

  for (const item of validEntries) {
    lines.push('  <anime>');
    lines.push(`    <series_animedb_id>${item.malId}</series_animedb_id>`);
    lines.push(`    <series_title>${escapeXml(item.title)}</series_title>`);
    lines.push(`    <series_type>${escapeXml(item.type)}</series_type>`);
    lines.push(`    <series_episodes>${item.totalEpisodes}</series_episodes>`);
    lines.push('    <my_id>0</my_id>');
    lines.push(`    <my_watched_episodes>${item.watchedEpisodes}</my_watched_episodes>`);
    lines.push('    <my_start_date>0000-00-00</my_start_date>');
    lines.push('    <my_finish_date>0000-00-00</my_finish_date>');
    lines.push('    <my_rated></my_rated>');
    lines.push(`    <my_score>${item.score}</my_score>`);
    lines.push('    <my_storage></my_storage>');
    lines.push('    <my_storage_value>0.00</my_storage_value>');
    lines.push(`    <my_status>${escapeXml(item.status)}</my_status>`);
    lines.push('    <my_comments></my_comments>');
    lines.push('    <my_times_watched>0</my_times_watched>');
    lines.push('    <my_rewatch_value></my_rewatch_value>');
    lines.push('    <my_priority>LOW</my_priority>');
    lines.push('    <my_tags></my_tags>');
    lines.push('    <my_rewatching>0</my_rewatching>');
    lines.push('    <my_rewatching_ep>0</my_rewatching_ep>');
    lines.push('    <my_discuss>1</my_discuss>');
    lines.push('    <my_sns>default</my_sns>');
    lines.push('    <my_update_on_import>1</my_update_on_import>');
    lines.push('  </anime>');
  }

  lines.push('</myanimelist>');
  lines.push('');

  return {
    xml: lines.join('\n'),
    exportedCount: validEntries.length,
    skippedCount,
  };
}
