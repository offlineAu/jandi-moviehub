/** Translate catalog seasons into the five-part numbering used by these providers. */
export function providerEpisode(tvId: string, season: number, episode: number) {
  if (tvId === '71446') {
    // TMDB groups Parts 3 and 4 into Season 2, and Part 5 into Season 3.
    // Season 1 was recut for streaming; its episodes do not map one-to-one.
    if (season === 2 && episode >= 1 && episode <= 16)
      return episode <= 8 ? { season: 3, episode } : { season: 4, episode: episode - 8 };
    if (season === 3 && episode >= 1 && episode <= 10) return { season: 5, episode };
  }
  return { season, episode };
}

/** Artwork coordinates only. Provider Parts 1–2 have no one-to-one original-cut match. */
export function providerCatalogEpisode(part: number, episode: number) {
  if (part === 3) return { season: 2, episode };
  if (part === 4) return { season: 2, episode: episode + 8 };
  if (part === 5) return { season: 3, episode };
  return null;
}
