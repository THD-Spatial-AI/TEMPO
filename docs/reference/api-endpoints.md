# Backend API Reference

The Go backend exposes a REST API on `localhost:8082`. All endpoints are under the `/api` prefix. The frontend communicates exclusively through this API; direct calls from external tools are also supported.

---

## Base URL

```
http://localhost:8082/api
```

All responses are JSON. All request bodies must be `Content-Type: application/json`.

---

## Health

### `GET /api/health`

Returns the backend status.

**Response**
```json
{ "status": "ok" }
```

---

## Models

### `GET /api/models`

List all saved models.

**Response**
```json
[
  {
    "id": "3f7b...",
    "name": "My First Model",
    "description": "Quick test model",
    "created_at": "2026-03-01T10:00:00Z",
    "updated_at": "2026-03-02T14:30:00Z"
  }
]
```

---

### `POST /api/models`

Create a new model. The body is the full model JSON from the frontend.

**Request body**: any JSON object — the full frontend model state is stored as-is.

**Response**
```json
{ "id": "3f7b..." }
```

---

### `GET /api/models/:id`

Retrieve a single model by ID.

**Response**: the full model JSON as saved.

---

### `PUT /api/models/:id`

Update an existing model. Full replacement — the entire model JSON is overwritten.

**Response**
```json
{ "status": "updated" }
```

---

### `DELETE /api/models/:id`

Delete a model and all associated jobs.

**Response**
```json
{ "status": "deleted" }
```

---

## Jobs (solver runs)

### `POST /api/models/:id/run`

Submit a model to the Calliope solver. Creates a new job.

**Optional body**
```json
{ "scenario": "high_carbon_price" }
```

**Response**
```json
{ "job_id": "a1b2c3..." }
```

---

### `GET /api/jobs/:id`

Get the status of a job.

**Response**
```json
{
  "id": "a1b2c3...",
  "model_id": "3f7b...",
  "status": "running",   // "pending" | "running" | "completed" | "failed"
  "created_at": "...",
  "finished_at": null
}
```

---

### `GET /api/jobs/:id/results`

Retrieve the optimization results for a completed job.

**Response**: the full results JSON as written by `calliope_runner.py`. Only available when `status == "completed"`.

---

## OSM / Geographic data

### `GET /api/osm/:layer`

Fetch OSM features as GeoJSON for a bounding box.

**Path parameter**: `layer` — one of `substations`, `power_plants`, `power_lines`, `boundaries`.

**Query parameters**:

| Parameter | Description |
|---|---|
| `bbox` | Bounding box as `minLon,minLat,maxLon,maxLat` |
| `country` | ISO country code (alternative to bbox) |

**Response**: GeoJSON `FeatureCollection`.

---

### `GET /api/osm/layers`

List available OSM layer names.

---

### `GET /api/osm/regions`

List geographic regions for which pre-processed data is available (GeoServer mode only).

---

### `GET /api/geocode`

Resolve a place name to coordinates using Nominatim.

**Query parameter**: `q` — place name string.

**Response**
```json
{
  "lat": 48.83,
  "lon": 12.95,
  "display_name": "Deggendorf, Bavaria, Germany",
  "bbox": [12.8, 48.7, 13.1, 48.95]
}
```

---

## Completed runs (persistent history)

These endpoints persist the results of completed solver runs so they can be browsed after the job record is cleaned up.

### `POST /api/completed-runs`

Save a completed run record (called internally by the backend when a job finishes).

**Request body**: completed run JSON object.

**Response**
```json
{ "id": "r1s2t3..." }
```

---

### `GET /api/completed-runs`

List all saved completed runs.

**Response**
```json
[
  {
    "id": "r1s2t3...",
    "model_id": "3f7b...",
    "model_name": "My First Model",
    "created_at": "2026-03-01T14:00:00Z",
    "status": "completed"
  }
]
```

---

### `DELETE /api/completed-runs/:id`

Delete a completed run record.

**Response**
```json
{ "status": "deleted" }
```

---

## Technology database proxy

The backend proxies requests to the local OEO Technology Database API service (default: `http://localhost:8005`). This avoids CORS issues when the frontend calls the tech database directly.

### `GET /tech/health`

Health probe for the tech database service.

### `ANY /tech/api/v1/*`

Pass-through proxy for all OEO Technology Database API endpoints. See [Technology Templates](technology-templates.md#oeo-technology-database-api) for the available routes.

