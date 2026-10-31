import type { AlgCase } from '../data/types';
import {
  comparePriorityCases,
  data,
  getProbabilityTieRanks,
  getDisplayName,
  learnedCases,
  type SortMode,
} from './state';

export type LearnFilter = 'all' | 'learned' | 'unlearned';

export type SearchMatch =
  | { type: 'simple'; searchTerm: string }
  | { type: 'slashed-normal'; searchPart1: string; searchPart2: string }
  | { type: 'slashed-flipped'; searchPart1: string; searchPart2: string };

/** Stores search matches per case name for highlight rendering. */
export const searchMatches = new Map<number, SearchMatch>();

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Port of the legacy `filterAndSort` computation. Pure: returns the filtered +
 * sorted list of cases and populates `searchMatches` for highlighting.
 */
export function computeFilteredData(
  searchTermRaw: string,
  sortType: SortMode,
  learnFilter: LearnFilter,
): AlgCase[] {
  const searchTerm = searchTermRaw.toLowerCase().trim();
  searchMatches.clear();

  const filteredData = data.filter((item) => {
    let matchesLearnFilter = true;
    if (learnFilter === 'learned') {
      matchesLearnFilter = learnedCases.has(item.id);
    } else if (learnFilter === 'unlearned') {
      matchesLearnFilter = !learnedCases.has(item.id);
    }

    if (!matchesLearnFilter) return false;
    if (!searchTerm) return true;

    const displayName = getDisplayName(item.id);
    const displayNameLower = displayName.toLowerCase();
    const titleHasSlash = displayName.includes('/');
    const searchHasSlash = searchTerm.includes('/');

    if (!searchHasSlash) {
      if (displayNameLower.includes(searchTerm)) {
        searchMatches.set(item.id, { type: 'simple', searchTerm });
        return true;
      }
      return false;
    }

    if (searchHasSlash && titleHasSlash) {
      const searchParts = searchTerm.split('/').map((p) => p.trim());
      const titleParts = displayName.split('/').map((p) => p.trim());

      if (searchParts.length === 2 && titleParts.length === 2) {
        const [searchPart1, searchPart2] = searchParts;
        const [titlePart1, titlePart2] = titleParts;
        const t1 = titlePart1.toLowerCase();
        const t2 = titlePart2.toLowerCase();

        const normalMatch = t1.includes(searchPart1) && t2.includes(searchPart2);
        const flippedMatch = t2.includes(searchPart1) && t1.includes(searchPart2);

        if (normalMatch) {
          searchMatches.set(item.id, { type: 'slashed-normal', searchPart1, searchPart2 });
          return true;
        }
        if (flippedMatch) {
          searchMatches.set(item.id, { type: 'slashed-flipped', searchPart1, searchPart2 });
          return true;
        }
      }
      return false;
    }

    return false;
  });

  if (sortType === 'priority') {
    filteredData.sort((a, b) => b.probability - a.probability);
    filteredData.sort(comparePriorityCases);
  } else {
    // Probability tiers first; order within a tier follows the learning order.
    const ranks = getProbabilityTieRanks();
    const direction = sortType === 'antiProbability' ? -1 : 1;
    filteredData.sort((a, b) => {
      const diff = b.probability - a.probability;
      if (Math.abs(diff) > 1e-9) return diff * direction;
      return (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0);
    });
  }

  return filteredData;
}

/** Partial-match highlight used by slashed search modes. */
export function highlightPartialMatch(text: string, searchTerm: string): string {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  return text.replace(regex, '<mark class="search-hl">$1</mark>');
}
