# MEDIANFLOW

Real-time score intelligence powered by an exact two-heap running median.

## Requirements

- Python 3.10+
- Node.js 18+

## Run locally

In one terminal, create a Python environment, install dependencies, and start the API:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

In another terminal, install the frontend dependencies and start Vite:

```powershell
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The frontend connects to the API at `http://localhost:8000`; set `VITE_API_URL` to override it.

## Verify

```powershell
python -m pytest
npm run build
```

## API

- `GET /api/health` — service health
- `GET /api/state` — current session metrics and recent histories
- `GET /api/heaps` — heap array contents for the visualizer (requested on demand)
- `POST /api/scores` — insert one signed 32-bit integer (`{"value": 42}`)
- `DELETE /api/session` — clear the in-memory session
- `POST /api/csv` — validate and insert a CSV whose first column contains scores
- `POST /api/benchmark` — benchmark a generated stream (`{"count": 10000}`)

The backend keeps the lower half in a max-heap and the upper half in a min-heap. Insertions take O(log n), and the median is available in O(1). Even-sized streams return the arithmetic mean of the two heap roots.
