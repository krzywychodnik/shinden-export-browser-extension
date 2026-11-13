import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, titleSimilarity, pickBestCandidate } from '../src/matcher.js';

describe('normalizeTitle', () => {
  it('strips punctuation, accents, and extra whitespace', () => {
    assert.equal(normalizeTitle("Steins;Gate: 0!"), 'steins gate 0');
    assert.equal(normalizeTitle('Kaguya-sama: Love Is War'), 'kaguya sama love is war');
  });
});

describe('titleSimilarity', () => {
  it('returns 1 for identical normalized titles and lower scores for different ones', () => {
    assert.equal(titleSimilarity('Attack on Titan', 'attack on titan'), 1);
    assert.ok(titleSimilarity('Shingeki no Kyojin', 'Shingeki no Kyojin Season 2') > 0.7);
    assert.ok(titleSimilarity('Naruto', 'Bleach') < 0.3);
  });
});

describe('pickBestCandidate', () => {
  it('selects the closest matching MAL candidate and applies type/episode hints', () => {
    const candidates = [
      {
        malId: 100,
        primaryTitle: 'Fullmetal Alchemist',
        titles: ['Fullmetal Alchemist', 'Hagane no Renkinjutsushi'],
        type: 'TV',
        episodes: 51,
      },
      {
        malId: 5114,
        primaryTitle: 'Fullmetal Alchemist: Brotherhood',
        titles: ['Fullmetal Alchemist: Brotherhood', 'Hagane no Renkinjutsushi: Fullmetal Alchemist'],
        type: 'TV',
        episodes: 64,
      },
    ];

    const best = pickBestCandidate('Fullmetal Alchemist Brotherhood', candidates, {
      expectedType: 'TV',
      expectedEpisodes: 64,
    });

    assert.ok(best);
    assert.equal(best.malId, 5114);
    assert.equal(best.confidence, 1);
  });
});
