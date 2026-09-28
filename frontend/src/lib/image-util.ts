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

export const getPosterUrl = async (id: number | string, type: string, title: string): Promise<string> => {
  const cached = getCachedPoster(id);
  if (cached) return cached;

  try {
    let posterUrl: string | null = null;
    if (type === "Anime") {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${id}`);
      if (res.ok) {
        const data = await res.json();
        posterUrl = data.data?.images?.jpg?.large_image_url || null;
      }
    } else {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}`
      );
      
      if (!res.ok) {
        const search = await fetch(
          `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`
        );
        const searchData = await search.json();
        if (searchData.results?.[0]?.poster_path) {
          posterUrl = `https://image.tmdb.org/t/p/w500${searchData.results[0].poster_path}`;
        }
      } else {
        const data = await res.json();
        if (data.poster_path) {
          posterUrl = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
        }
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