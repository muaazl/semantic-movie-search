import os
import sys
import pickle
import time
from pinecone import Pinecone
import numpy as np

sys.stdout.reconfigure(line_buffering=True)

key = os.getenv("PINECONE_API_KEY")
if not key:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.strip().startswith("PINECONE_API_KEY"):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break


print("Connecting to Pinecone...")
pc = Pinecone(api_key=key)
index = pc.Index("cine-match")

print("Listing all vector IDs...")
all_ids = []
pagination_token = None

t0 = time.perf_counter()
while True:
    if pagination_token:
        res = index.list_paginated(pagination_token=pagination_token, limit=100)
    else:
        res = index.list_paginated(limit=100)
    
    vectors = res.get('vectors', [])
    for v in vectors:
        all_ids.append(v['id'])
        
    pagination = res.get('pagination')
    pagination_token = pagination.get('next') if pagination else None
    if not pagination_token or len(vectors) == 0:
        break
    if len(all_ids) % 1000 == 0:
        print(f"  Listed {len(all_ids)} IDs...")

print(f"Listed {len(all_ids)} vector IDs in {(time.perf_counter() - t0):.2f}s.")

print("Fetching vectors and metadata in batches...")
batch_size = 100
records = []
t0 = time.perf_counter()

for i in range(0, len(all_ids), batch_size):
    batch_ids = all_ids[i:i + batch_size]
    fetched = index.fetch(ids=batch_ids)
    vectors_dict = fetched.get('vectors', {})
    
    for vid, vdata in vectors_dict.items():
        meta = vdata.get('metadata', {})
        values = vdata.get('values', [])
        records.append({
            'id': vid,
            'original_id': str(meta.get('original_id', '')),
            'title': str(meta.get('title', '')),
            'type': str(meta.get('type', 'Movie')),
            'rating': float(meta.get('rating', 0.0)),
            'vector': np.array(values, dtype=np.float32)
        })
    if (i + batch_size) % 1000 < batch_size or (i + batch_size) >= len(all_ids):
        print(f"  Fetched {len(records)}/{len(all_ids)} records...")

print(f"Finished fetching {len(records)} records in {(time.perf_counter() - t0):.2f}s.")

output_file = os.path.join(os.path.dirname(__file__), "movie_vectors.pkl")
print(f"Saving to {output_file}...")
with open(output_file, "wb") as f:
    pickle.dump(records, f)

print(f"✅ Successfully saved {len(records)} items to {output_file}!")
