# CineMatch.

A hybrid movie recommender that combines semantic AI search with genre-based filtering to surface relevant results based on your input.

https://cinematch-muaaz.vercel.app/

<img width="1920" height="911" alt="image" src="https://github.com/user-attachments/assets/9080f41e-791f-4fa0-ade9-70a701fcb49f" />

## Features

- **Semantic Search:** Search using natural language (e.g. *"a mind-bending sci-fi movie about dreams"*). Powered by `sentence-transformers` and Pinecone Vector DB.
- **Hybrid Filtering:** Combines strict genre filtering with vector-based semantic search.
- **Rich Movie Details:** Modals include streaming providers, ratings, and an AI-generated reason for why the movie was recommended.
- **Dynamic UI:** Framer Motion animations, mood-based background gradients, and glassmorphism styling.

## Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Framer Motion
- **Icons:** Lucide React + React Icons

### Backend
- **API:** FastAPI (Python)
- **ML Model:** `all-MiniLM-L6-v2` (HuggingFace)
- **Database:** Pinecone (Vector Database)
- **Data Source:** TMDB API + Custom Kaggle Dataset

## Getting Started

### Prerequisites
1. Node.js and pnpm installed.
2. Python 3.9+ installed.
3. A Pinecone API key from [pinecone.io](https://pinecone.io). Set it as `PINECONE_API_KEY` in your environment before running the ETL script.

### 1. Clone the Repository
```bash
git clone https://github.com/muaazl/cine-match.git
cd cine-match
```

### 2. Set Up the Backend
```bash
cd backend

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Run once to populate the vector database
python etl_pinecone.py

uvicorn main:app --reload
```
The API will be available at `http://127.0.0.1:8000`.

### 3. Set Up the Frontend
Open a new terminal:
```bash
cd frontend
pnpm install
pnpm dev
```
The app will be available at `http://localhost:3000`.

## How It Works

1. **Data Ingestion:** 40,000+ movies and anime are processed and converted into 384-dimensional vectors using a Transformer model.
2. **Vector Search:** User input (text prompt or mood selection) is converted into a vector at query time.
3. **Cosine Similarity:** Pinecone finds movies mathematically closest to the query vector, enabling conceptual matching rather than keyword matching.
