# CineMatch. 🎬

**The "World Class" Hybrid Movie Recommender.**  
CineMatch goes beyond simple genre filtering. It uses **Semantic Search (AI)** to understand the nuance of your request, combined with a "Concierge Wizard" to curate the perfect watchlist based on your mood and specific taste.

https://cinematch-muaaz.vercel.app/

---

https://github.com/user-attachments/assets/116475d2-d368-45d3-ba89-6c81120ea02f

---

## ✨ Features

- **🧠 Semantic AI Brain:** Search naturally (e.g., *"A mind-bending sci-fi movie about dreams"* returns *Inception*). Powered by `sentence-transformers` and Pinecone Vector DB.
- **🧙‍♂️ The Concierge Wizard:** A multi-step interactive guide that learns your Name, Mood, and Taste to generate hyper-personalized results.
- **🎨 Dynamic UI:** Beautiful, "Netflix-style" interface with Framer Motion animations, dynamic background gradients based on mood, and glassmorphism.
- **⚡ Hybrid Filtering:** Combines strict Genre filtering with "Vibe-based" Vector search.
- **🎲 I'm Feeling Lucky:** One-click random high-quality suggestion generator.
- **📱 Rich Details:** Clean modals with "Where to Watch" providers, ratings, and AI-generated reasons for *why* a movie was recommended.

## 🛠️ Tech Stack

### Frontend (The Face)
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Framer Motion (Animations)
- **Icons:** Lucide React + React Icons (Brand logos)

### Backend (The Brain)
- **API:** FastAPI (Python)
- **ML Model:** `all-MiniLM-L6-v2` (HuggingFace)
- **Database:** Pinecone (Vector Database for Embeddings)
- **Data Source:** TMDB API (Images/Trailers) + Custom Kaggle Dataset (Metadata)

## 🚀 Getting Started Locally

### Prerequisites
1. Node.js & pnpm installed.
2. Python 3.9+ installed.
3. A free API Key from [Pinecone.io](https://pinecone.io).

### 1. Clone the Repo
```bash
git clone https://github.com/muaazl/cine-match.git
cd cine-match
```

### 2. Setup Backend (The AI Engine)
```bash
cd ml_engine
# Create a virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Run the ETL script once to populate your Vector DB
# (Make sure to set your PINECONE_API_KEY in the script first)
python etl_pinecone.py

# Start the Server
uvicorn main:app --reload
```
*The API will run at `http://127.0.0.1:8000`*

### 3. Setup Frontend (The UI)
Open a new terminal:
```bash
cd frontend

# Install dependencies
pnpm install

# Start the App
pnpm dev
```
*The App will run at `http://localhost:3000`*

## 🧠 How It Works

1.  **Data Ingestion:** We processed 40,000+ movies and anime, converting their plots and genres into 384-dimensional vectors using a Transformer model.
2.  **Vector Search:** When you type a prompt or select a mood, we convert your input into a vector math equation.
3.  **Cosine Similarity:** The database finds movies that are mathematically "closest" to your query in the vector space, allowing for conceptual matching rather than just keyword matching.
