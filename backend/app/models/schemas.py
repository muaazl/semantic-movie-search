from pydantic import BaseModel

class SearchRequest(BaseModel):
    query: str
    filter_type: str = "All"

class QuizRequest(BaseModel):
    genre: str

class FinalRecommendationRequest(BaseModel):
    mood: str
    selected_titles: list[str]
    genre: str

class CachePosterRequest(BaseModel):
    id: str
    poster: str
