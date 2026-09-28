from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from app.api.routes import router, get_engine

app = FastAPI(title="CineMatch 50/50 Hybrid Search API")

allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()] if allowed_origins_env else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.on_event("shutdown")
def on_shutdown():
    engine = get_engine()
    engine.save_poster_cache()
