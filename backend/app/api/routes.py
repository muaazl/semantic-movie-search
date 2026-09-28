from fastapi import APIRouter, HTTPException
from app.models.schemas import SearchRequest, QuizRequest, FinalRecommendationRequest, CachePosterRequest
from app.services.search_service import HybridSearchEngine

router = APIRouter()

# Initialize in-memory 50/50 Hybrid Engine
engine = HybridSearchEngine()

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "records_count": len(engine.records) if hasattr(engine, 'records') else 0,
        "posters_cached": len(engine.posters_cache) if hasattr(engine, 'posters_cache') else 0
    }

@router.post("/search")
def search(req: SearchRequest):
    try:
        return engine.search(query=req.query, filter_type=req.filter_type, top_k=20)
    except Exception as e:
        print(f"Error in /search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mood")
def mood_search(mood: str):
    mood_map = {
        "Happy": "Feel good movie, comedy, lighthearted, happy ending",
        "Dark": "Dark, psychological thriller, disturbing, gritty, noir",
        "Adrenaline": "High stakes action, fast paced, car chases, explosions",
        "Mind-Bending": "Confusing plot, time travel, philosophy, deep thoughts",
        "Romantic": "Love story, romance, heartbreak, relationship",
        "Scary": "Horror, ghosts, jump scares, terrifying"
    }
    search_query = mood_map.get(mood, mood)
    return search(SearchRequest(query=search_query))

@router.post("/get-quiz-items")
def get_quiz_items(req: QuizRequest):
    try:
        return engine.get_quiz_items(genre=req.genre, top_k=20)
    except Exception as e:
        print(f"Error in /get-quiz-items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/hybrid-recommend")
def hybrid_recommend(req: FinalRecommendationRequest):
    try:
        return engine.hybrid_recommend(
            mood=req.mood,
            genre=req.genre,
            selected_titles=req.selected_titles,
            top_k=20
        )
    except Exception as e:
        print(f"Error in /hybrid-recommend: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/lucky")
def lucky_pick():
    try:
        return engine.lucky_pick()
    except Exception as e:
        print(f"Error in /lucky: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cache-poster")
def cache_poster(req: CachePosterRequest):
    try:
        engine.update_poster_cache(req.id, req.poster)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

def get_engine():
    return engine
