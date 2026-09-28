import os
import pickle
import time
import json
import numpy as np
from functools import lru_cache
from rank_bm25 import BM25Okapi
from rapidfuzz import fuzz
from sentence_transformers import SentenceTransformer

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "about", "above", "after", "along", "around",
    "at", "before", "behind", "below", "beside", "between", "by", "down", "during",
    "except", "for", "from", "in", "inside", "into", "like", "near", "of", "off", "on",
    "onto", "out", "outside", "over", "past", "since", "through", "throughout", "till",
    "to", "toward", "under", "until", "up", "upon", "with", "within", "without",
    "movie", "movies", "film", "films", "anime", "show", "watch"
}

def tokenize(text: str, filter_stopwords: bool = True):
    # Normalize punctuation
    clean = text.lower().replace("-", " ").replace(":", " ").replace("'", "").replace('"', "")
    tokens = [w for w in clean.split() if w.isalnum()]
    if filter_stopwords:
        filtered = [w for w in tokens if w not in STOPWORDS]
        return filtered if filtered else tokens
    return tokens

class HybridSearchEngine:
    def __init__(self, data_path: str = None, poster_cache_path: str = None):
        service_dir = os.path.dirname(__file__)
        base_dir = os.path.abspath(os.path.join(service_dir, "..", ".."))
        self.data_path = data_path or os.path.join(base_dir, "movie_vectors.pkl")
        self.poster_cache_path = poster_cache_path or os.path.join(base_dir, "posters_cache.json")
        
        print("[HybridEngine] Loading movie vectors & metadata...")
        t0 = time.perf_counter()
        with open(self.data_path, "rb") as f:
            self.records = pickle.load(f)
        print(f"[HybridEngine] Loaded {len(self.records)} records in {(time.perf_counter() - t0)*1000:.1f}ms")
        
        # Build normalized float32 matrix
        raw_vectors = np.array([r['vector'] for r in self.records], dtype=np.float32)
        norms = np.linalg.norm(raw_vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.matrix = raw_vectors / norms
        
        # Precompute title lookups & lowercases
        self.titles_lower = [r['title'].lower() for r in self.records]
        self.types = np.array([r['type'] for r in self.records])
        self.ratings = np.array([r['rating'] for r in self.records], dtype=np.float32)
        
        # Build BM25 index over titles
        print("[HybridEngine] Building BM25 lexical index...")
        t0 = time.perf_counter()
        tokenized_corpus = [tokenize(t, filter_stopwords=False) for t in self.titles_lower]
        self.bm25 = BM25Okapi(tokenized_corpus)
        print(f"[HybridEngine] BM25 ready in {(time.perf_counter() - t0)*1000:.1f}ms")
        
        # Load AI embedding model
        print("[HybridEngine] Loading SentenceTransformer ('all-MiniLM-L6-v2')...")
        t0 = time.perf_counter()
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        print(f"[HybridEngine] AI Model ready in {(time.perf_counter() - t0)*1000:.1f}ms")
        
        # Load poster cache
        self.posters_cache = {}
        if os.path.exists(self.poster_cache_path):
            try:
                with open(self.poster_cache_path, "r", encoding="utf-8") as f:
                    self.posters_cache = json.load(f)
                print(f"[HybridEngine] Loaded {len(self.posters_cache)} cached posters.")
            except Exception as e:
                print(f"[HybridEngine] Could not load poster cache: {e}")

    @lru_cache(maxsize=2048)
    def encode_query(self, query: str) -> np.ndarray:
        return self.model.encode(query, normalize_embeddings=True)

    def save_poster_cache(self):
        try:
            with open(self.poster_cache_path, "w", encoding="utf-8") as f:
                json.dump(self.posters_cache, f)
        except Exception as e:
            print(f"Error saving poster cache: {e}")

    def update_poster_cache(self, item_id: str, poster_url: str):
        if poster_url and item_id not in self.posters_cache:
            self.posters_cache[item_id] = poster_url

    def search(self, query: str, filter_type: str = "All", top_k: int = 20):
        t_start = time.perf_counter()
        q_raw = query.strip()
        if not q_raw:
            return {"results": [], "meta": {"latency_ms": 0.0}}
            
        q_clean = q_raw.lower()
        q_tokens = tokenize(q_raw, filter_stopwords=True)
        if not q_tokens:
            q_tokens = tokenize(q_raw, filter_stopwords=False)
            
        n_items = len(self.records)
        
        # 1. Semantic Vector Retrieval (50% weight)
        t0 = time.perf_counter()
        q_vec = self.encode_query(q_clean)
        t_encode = (time.perf_counter() - t0) * 1000
        
        t0 = time.perf_counter()
        sem_scores = np.dot(self.matrix, q_vec)
        
        # Apply type filter if requested
        if filter_type != "All":
            mask = (self.types == filter_type)
            sem_scores = np.where(mask, sem_scores, -1.0)
            
        candidate_count = min(250, n_items)
        sem_top_indices = np.argpartition(-sem_scores, candidate_count - 1)[:candidate_count]
        sem_top_indices = sem_top_indices[np.argsort(-sem_scores[sem_top_indices])]
        t_sem = (time.perf_counter() - t0) * 1000
        
        # 2. Lexical Retrieval (50% weight)
        t0 = time.perf_counter()
        if q_tokens:
            bm25_scores = np.array(self.bm25.get_scores(q_tokens), dtype=np.float32)
            if filter_type != "All":
                bm25_scores = np.where(mask, bm25_scores, 0.0)
            max_bm25 = float(np.max(bm25_scores)) if len(bm25_scores) > 0 else 1.0
            if max_bm25 > 0:
                bm25_scores /= max_bm25
        else:
            bm25_scores = np.zeros(n_items, dtype=np.float32)
            
        lex_top_indices = np.argpartition(-bm25_scores, candidate_count - 1)[:candidate_count]
        lex_top_indices = lex_top_indices[np.argsort(-bm25_scores[lex_top_indices])]
        t_lex = (time.perf_counter() - t0) * 1000
        
        # 3. 50/50 Fusion with RRF and Precision Boost
        t0 = time.perf_counter()
        sem_rank_map = {idx: rank for rank, idx in enumerate(sem_top_indices)}
        lex_rank_map = {idx: rank for rank, idx in enumerate(lex_top_indices)}
        
        # Combine candidate pool
        candidates = set(sem_top_indices) | set(lex_top_indices)
        
        k_rrf = 60.0
        results = []
        is_short_query = len(q_tokens) <= 3
        
        for idx in candidates:
            rec = self.records[idx]
            t_lower = self.titles_lower[idx]
            
            # Rank assignments
            r_sem = sem_rank_map.get(idx, 300)
            r_lex = lex_rank_map.get(idx, 300)
            
            # Equal 50/50 RRF
            rrf_sem = 0.50 * (1.0 / (k_rrf + r_sem))
            rrf_lex = 0.50 * (1.0 / (k_rrf + r_lex))
            fused_score = rrf_sem + rrf_lex
            
            # Exact Match, Prefix Match & Word/Phrase Boost
            if t_lower == q_clean:
                fused_score += 1.0   # Exact match priority
            elif t_lower.startswith(q_clean):
                fused_score += 0.6   # Prefix match priority
            elif f" {q_clean} " in f" {t_lower} " or q_clean in t_lower:
                fused_score += 0.45  # Phrase substring priority (e.g. "dark knight" in "the dark knight")
            elif is_short_query:
                # Fast fuzzy ratio for typos on short title queries
                fz = fuzz.ratio(q_clean, t_lower)
                if fz >= 80:
                    fused_score += 0.35 * (fz / 100.0)
                    
            # Subtle rating prior
            fused_score += 0.015 * (self.ratings[idx] / 10.0)
            
            # Check cached poster
            cached_poster = self.posters_cache.get(rec['original_id']) or self.posters_cache.get(rec['id'])
            
            results.append({
                "id": rec['original_id'],
                "title": rec['title'],
                "type": rec['type'],
                "score": round(float(fused_score), 4),
                "rating": rec['rating'],
                "poster": cached_poster
            })
            
        results.sort(key=lambda x: x['score'], reverse=True)
        t_fusion = (time.perf_counter() - t0) * 1000
        t_total = (time.perf_counter() - t_start) * 1000
        
        return {
            "results": results[:top_k],
            "meta": {
                "total_ms": round(t_total, 2),
                "encode_ms": round(t_encode, 2),
                "sem_ms": round(t_sem, 2),
                "lex_ms": round(t_lex, 2),
                "fusion_ms": round(t_fusion, 2),
                "cached_posters_count": sum(1 for r in results[:top_k] if r.get('poster'))
            }
        }
    
    def hybrid_recommend(self, mood: str, genre: str, selected_titles: list[str], top_k: int = 20):
        joined_titles = ", ".join(selected_titles)
        semantic_query = f"{mood} {genre} similar to {joined_titles}"
        q_vec = self.encode_query(semantic_query)
        
        sem_scores = np.dot(self.matrix, q_vec)
        if genre.lower() == "anime":
            mask = (self.types == "Anime")
            sem_scores = np.where(mask, sem_scores, -1.0)
        elif genre and genre != "All":
            # For general genre, prefer Movie unless Anime specified
            mask = (self.types == "Movie")
            sem_scores = np.where(mask, sem_scores, -1.0)
            
        top_indices = np.argsort(-sem_scores)[:top_k + len(selected_titles)]
        
        import random
        recs = []
        for idx in top_indices:
            rec = self.records[idx]
            if rec['title'] in selected_titles:
                continue
            cached_poster = self.posters_cache.get(rec['original_id']) or self.posters_cache.get(rec['id'])
            reason = f"Because you liked {random.choice(selected_titles)} and wanted something {mood}."
            recs.append({
                "id": rec['original_id'],
                "title": rec['title'],
                "type": rec['type'],
                "score": round(float(sem_scores[idx]), 4),
                "rating": rec['rating'],
                "reason": reason,
                "poster": cached_poster
            })
            if len(recs) >= top_k:
                break
        return {"results": recs}
        
    def get_quiz_items(self, genre: str, top_k: int = 20):
        query = f"Popular, famous, high rated {genre} movies or anime"
        q_vec = self.encode_query(query)
        sem_scores = np.dot(self.matrix, q_vec)
        
        target_type = "Anime" if genre.lower() == "anime" else "Movie"
        mask = (self.types == target_type)
        sem_scores = np.where(mask, sem_scores, -1.0)
        
        # Combine semantic relevance with high rating
        combined = sem_scores + (self.ratings / 10.0) * 0.2
        top_indices = np.argsort(-combined)[:top_k]
        
        items = []
        for idx in top_indices:
            rec = self.records[idx]
            cached_poster = self.posters_cache.get(rec['original_id']) or self.posters_cache.get(rec['id'])
            items.append({
                "id": rec['original_id'],
                "title": rec['title'],
                "type": rec['type'],
                "rating": rec['rating'],
                "poster": cached_poster
            })
        return {"items": items}
        
    def lucky_pick(self):
        import random
        # Pick from high-rated classic masterpieces (rating >= 7.8)
        high_rated_indices = np.where(self.ratings >= 7.8)[0]
        if len(high_rated_indices) == 0:
            high_rated_indices = np.arange(len(self.records))
        chosen_idx = int(random.choice(high_rated_indices))
        rec = self.records[chosen_idx]
        cached_poster = self.posters_cache.get(rec['original_id']) or self.posters_cache.get(rec['id'])
        return {
            "id": rec['original_id'],
            "title": rec['title'],
            "type": rec['type'],
            "rating": rec['rating'],
            "reason": "Serendipity",
            "poster": cached_poster
        }
