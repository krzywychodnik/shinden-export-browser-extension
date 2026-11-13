import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMalStatus,
  normalizeScore,
  escapeXml,
  generateMalXml,
} from '../src/mal-xml.js';

describe('normalizeMalStatus', () => {
  it('maps Polish and English Shinden statuses to exact MAL values', () => {
    assert.equal(normalizeMalStatus('Oglądane'), 'Watching');
    assert.equal(normalizeMalStatus('in_progress'), 'Watching');
    assert.equal(normalizeMalStatus('in-progress'), 'Watching');
    assert.equal(normalizeMalStatus('in progress'), 'Watching');
    assert.equal(normalizeMalStatus('Obejrzane'), 'Completed');
    assert.equal(normalizeMalStatus('Wstrzymane'), 'On-Hold');
    assert.equal(normalizeMalStatus('Porzucone'), 'Dropped');
    assert.equal(normalizeMalStatus('Planowane'), 'Plan to Watch');
    assert.equal(normalizeMalStatus('unknown'), 'Plan to Watch');
  });
});

describe('normalizeScore', () => {
  it('normalizes ratings to 0..10 integers', () => {
    assert.equal(normalizeScore('9/10'), 9);
    assert.equal(normalizeScore('10'), 10);
    assert.equal(normalizeScore('15'), 10);
    assert.equal(normalizeScore('-'), 0);
    assert.equal(normalizeScore(null), 0);
  });
});

describe('escapeXml', () => {
  it('escapes XML special characters', () => {
    assert.equal(
      escapeXml('Re:Zero & <"Test\'>'),
      'Re:Zero &amp; &lt;&quot;Test&apos;&gt;',
    );
  });
});

describe('generateMalXml', () => {
  it('builds valid MAL XML, counts statuses, and skips entries without malId', () => {
    const result = generateMalXml(
      [
        {
          malId: 5114,
          title: 'Fullmetal Alchemist: Brotherhood',
          type: 'TV',
          totalEpisodes: 64,
          watchedEpisodes: 0,
          score: 10,
          status: 'Obejrzane',
        },
        {
          malId: 21,
          title: 'One Piece',
          type: 'TV',
          totalEpisodes: 0,
          watchedEpisodes: 1050,
          score: 9,
          status: 'Oglądane',
        },
        {
          malId: null,
          title: 'Unmatched Show',
          score: 7,
          status: 'Planowane',
        },
      ],
      { userName: 'krzywy-chodnik' },
    );

    assert.equal(result.exportedCount, 2);
    assert.equal(result.skippedCount, 1);
    assert.match(result.xml, /<user_name>krzywy-chodnik<\/user_name>/);
    assert.match(result.xml, /<user_total_anime>2<\/user_total_anime>/);
    assert.match(result.xml, /<user_total_completed>1<\/user_total_completed>/);
    assert.match(result.xml, /<user_total_watching>1<\/user_total_watching>/);
    assert.match(result.xml, /<series_animedb_id>5114<\/series_animedb_id>/);
    assert.match(result.xml, /<my_watched_episodes>64<\/my_watched_episodes>/);
    assert.match(result.xml, /<my_status>Completed<\/my_status>/);
    assert.match(result.xml, /<my_score>10<\/my_score>/);
    assert.doesNotMatch(result.xml, /Unmatched Show/);
  });
});
