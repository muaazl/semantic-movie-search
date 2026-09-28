import os
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
from tqdm import tqdm
import time

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "cine-match")
DATA_PATH = '../data/'
MAX_ITEMS = 40000

def prepare_data():
    print("📂 Loading Datasets...")
    
    movies = pd.read_csv(DATA_PATH + 'movies_metadata.csv', low_memory=False)
    
    movies = movies[movies['release_date'].notna()]
    movies = movies[movies['vote_count'].notna()]
    
    movies['vote_count'] = pd.to_numeric(movies['vote_count'], errors='coerce')
    movies['vote_average'] = pd.to_numeric(movies['vote_average'], errors='coerce')
    movies['popularity'] = pd.to_numeric(movies['popularity'], errors='coerce')
    
    movies['release_date'] = pd.to_datetime(movies['release_date'], errors='coerce')
    movies = movies[
        (movies['vote_count'] > 50) &
        (movies['release_date'].dt.year >= 1980)
    ].copy()
    
    movies['overview'] = movies['overview'].fillna('')
    movies['title'] = movies['title'].fillna('')
    movies['text_chunk'] = "Movie: " + movies['title'] + ". Plot: " + movies['overview']
    
    movies['type'] = 'Movie'
    movies['image_id'] = movies['imdb_id']
    movies = movies[['id', 'title', 'text_chunk', 'type', 'vote_count', 'vote_average']]
    
    print(f"✅ Movies Processed: {len(movies)}")

    anime = pd.read_csv(DATA_PATH + 'anime.csv')
    anime = anime[anime['members'] > 10000]
    anime['type'] = 'Anime'
    
    anime['name'] = anime['name'].fillna('')
    anime['genre'] = anime['genre'].fillna('')
    anime['text_chunk'] = "Anime: " + anime['name'] + ". Genres: " + anime['genre'] + ". Type: " + anime['type']
    
    anime.rename(columns={'anime_id': 'id', 'name': 'title', 'rating': 'vote_average', 'members': 'vote_count'}, inplace=True)
    anime['image_id'] = anime['id']
    anime = anime[['id', 'title', 'text_chunk', 'type', 'vote_count', 'vote_average']]

    print(f"✅ Anime Processed: {len(anime)}")
    
    combined = pd.concat([movies, anime], ignore_index=True)
    
    combined = combined.sort_values(by='vote_count', ascending=False).head(MAX_ITEMS)
    
    print(f"🔥 Final Database Size: {len(combined)} items.")
    return combined

def upload_to_pinecone(df):
    print("🧠 Loading AI Model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    print("☁️ Connecting to Pinecone...")
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(INDEX_NAME)
    
    batch_size = 100
    total_batches = len(df) // batch_size + 1
    
    print("🚀 Starting Upload... (This will take a while!)")
    
    for i in tqdm(range(0, len(df), batch_size)):
        batch = df.iloc[i : i + batch_size]
        
        vectors = model.encode(batch['text_chunk'].tolist()).tolist()
        
        upsert_data = []
        for j, row in enumerate(batch.itertuples()):
            upsert_data.append({
                "id": f"{row.type}_{row.id}",
                "values": vectors[j],
                "metadata": {
                    "title": str(row.title),
                    "type": str(row.type),
                    "original_id": str(row.id),
                    "rating": float(row.vote_average) if pd.notna(row.vote_average) else 0.0
                }
            })
            
        try:
            index.upsert(vectors=upsert_data)
        except Exception as e:
            print(f"Error uploading batch: {e}")
            
    print("🎉 SUCCESS! All data is now in the Cloud Brain.")

if __name__ == "__main__":
    df = prepare_data()
    upload_to_pinecone(df)