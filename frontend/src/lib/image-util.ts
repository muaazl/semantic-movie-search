const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// Fast in-memory poster cache
const memoryPosterCache = new Map<string, string>();

// Try loading from localStorage if in browser
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem("cinematch_posters");
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.entries(parsed).forEach(([k, v]) => memoryPosterCache.set(k, v as string));
    }
  } catch (e) {
    // Ignore storage errors
  }
}

const persistCacheDebounced = (() => {
  let timeout: NodeJS.Timeout;
  return () => {
    if (typeof window === "undefined") return;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      try {
        const obj: Record<string, string> = {};
        let count = 0;
        for (const [k, v] of memoryPosterCache.entries()) {
          obj[k] = v;
          if (++count > 500) break; // Limit cache size
        }
        localStorage.setItem("cinematch_posters", JSON.stringify(obj));
      } catch (e) {
        // Storage full or quota exceeded
      }
    }, 1000);
  };
})();

export const getCachedPoster = (id: string | number): string | null => {
  return memoryPosterCache.get(String(id)) || null;
};

export const setCachedPoster = (id: string | number, url: string) => {
  if (!url) return;
  const key = String(id);
  memoryPosterCache.set(key, url);
  persistCacheDebounced();

  // Asynchronously notify backend to persist in server cache
  try {
    fetch(`${API_URL}/cache-poster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: key, poster: url }),
    }).catch(() => {});
  } catch (e) {}
};

/**
 * Fetch poster URL with multi-tiered fallback:
 * - Anime: AniList GraphQL (primary, no rate limits, fast CDN) -> TMDB Search -> Jikan (timeout-protected)
 * - Movies: TMDB ID lookup -> TMDB Title Search
 */
export const getPosterUrl = async (id: number | string, type: string, title: string): Promise<string> => {
  const cached = getCachedPoster(id);
  if (cached) return cached;

  try {
    let posterUrl: string | null = null;

    if (type === "Anime") {
      // 1. Primary: AniList GraphQL by MAL ID (fast, reliable, high-res CDN)
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const anilistRes = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            query: "query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { large extraLarge } } }",
            variables: { idMal: Number(id) }
          })
        });
        clearTimeout(timer);

        if (anilistRes.ok) {
          const data = await anilistRes.json();
          posterUrl = data.data?.Media?.coverImage?.large || data.data?.Media?.coverImage?.extraLarge || null;
        }
      } catch (e) {
        // AniList lookup failed or timed out
      }

      // 2. Secondary fallback: TMDB multi/search by title
      if (!posterUrl && TMDB_KEY) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          const searchRes = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`,
            { signal: controller.signal }
          );
          clearTimeout(timer);

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const firstWithPoster = searchData.results?.find((r: any) => r.poster_path);
            if (firstWithPoster?.poster_path) {
              posterUrl = `https://image.tmdb.org/t/p/w500${firstWithPoster.poster_path}`;
            }
          }
        } catch (e) {}
      }

      // 3. Tertiary fallback: Jikan with strict 3-second timeout
      if (!posterUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(`https://api.jikan.moe/v4/anime/${id}`, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            const data = await res.json();
            posterUrl = data.data?.images?.jpg?.large_image_url || null;
          }
        } catch (e) {}
      }
    } else {
      // Movies: TMDB direct id lookup, with search fallback
      if (TMDB_KEY) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(
            `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}`,
            { signal: controller.signal }
          );
          clearTimeout(timer);

          if (res.ok) {
            const data = await res.json();
            if (data.poster_path) {
              posterUrl = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
            }
          } else {
            const search = await fetch(
              `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`
            );
            if (search.ok) {
              const searchData = await search.json();
              if (searchData.results?.[0]?.poster_path) {
                posterUrl = `https://image.tmdb.org/t/p/w500${searchData.results[0].poster_path}`;
              }
            }
          }
        } catch (e) {}
      }
    }

    if (posterUrl) {
      setCachedPoster(id, posterUrl);
      return posterUrl;
    }
  } catch (e) {
    console.error("Image fetch error", e);
  }

  const fallback = "/poster-placeholder.jpg";
  return fallback;
};

/**
 * Enriches a list of items with posters in parallel while loading is shown.
 * Resolves cached posters instantly and batches missing ones with a timeout limit.
 */
export const enrichWithPosters = async (items: any[], maxParallel = 6): Promise<any[]> => {
  if (!items || items.length === 0) return [];
  const results = [...items];

  const missingIndices: number[] = [];
  results.forEach((item, idx) => {
    if (!item.poster) {
      const cached = getCachedPoster(item.id);
      if (cached) {
        results[idx] = { ...item, poster: cached };
      } else {
        missingIndices.push(idx);
      }
    }
  });

  if (missingIndices.length === 0) return results;

  // Process missing posters in parallel batches
  for (let i = 0; i < missingIndices.length; i += maxParallel) {
    const chunk = missingIndices.slice(i, i + maxParallel);
    await Promise.all(
      chunk.map(async (idx) => {
        const it = results[idx];
        try {
          const poster = await getPosterUrl(it.id, it.type, it.title);
          results[idx] = { ...it, poster };
        } catch {
          results[idx] = { ...it, poster: "/poster-placeholder.jpg" };
        }
      })
    );
  }

  return results;
};