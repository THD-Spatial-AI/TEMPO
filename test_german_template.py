"""
Test the German energy system template model end-to-end.
Uses urllib only (stdlib) — no pip install required.
"""
import json, urllib.request, urllib.parse, time, csv, io

BASE = "http://localhost:5000"

# ---------------------------------------------------------------------------
# Load the demand CSV to build demandProfile objects
# ---------------------------------------------------------------------------
DEMAND_FILE = (
    r"public\templates\german_energy_system\timeseries_data\german_demand_2024.csv"
)

with open(DEMAND_FILE, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

locs_with_demand = [k for k in rows[0].keys() if k != "datetime"]
demand_profiles = {}
for loc in locs_with_demand:
    vals = [float(r[loc]) for r in rows]
    demand_profiles[loc] = {
        "timeseries": vals,
        "hours": len(vals),
        "avgMW": round(sum(vals) / len(vals), 2),
        "maxMW": round(max(vals), 2),
        "minMW": round(min(vals), 2),
    }

print(f"Loaded demand for {len(locs_with_demand)} cities, {len(rows)} hours each")

# ---------------------------------------------------------------------------
# Build a minimal German template model payload
# (mirrors what the frontend sends after loadTemplateModel)
# ---------------------------------------------------------------------------
LOCATIONS = [
    {"name": "Berlin",    "latitude": 52.52,   "longitude": 13.405,
     "techs": {"solar_pv": {}, "wind_onshore": {}, "battery_storage": {}, "gas_ccgt": {}}},
    {"name": "Munich",    "latitude": 48.1351,  "longitude": 11.582,
     "techs": {"solar_pv": {}, "wind_onshore": {}, "gas_ccgt": {}, "battery_storage": {}}},
    {"name": "Hamburg",   "latitude": 53.5511,  "longitude": 9.9937,
     "techs": {"wind_onshore": {}, "solar_pv": {}, "battery_storage": {}, "gas_ccgt": {}}},
]

# Add demandProfile to each location
for loc in LOCATIONS:
    dp = demand_profiles.get(loc["name"])
    if dp:
        loc["demandProfile"] = dp

LINKS = [
    {"from": "Berlin", "to": "Munich",  "tech": "ac_transmission", "distance": 580},
    {"from": "Berlin", "to": "Hamburg", "tech": "ac_transmission", "distance": 288},
]

with open(r"public\templates\german_energy_system\technologies.json", encoding="utf-8") as f:
    raw_techs = json.load(f)

# Transform technologies.json format → runner format
TECHNOLOGIES = []
for tech_id, tech_def in raw_techs.items():
    TECHNOLOGIES.append({
        "name": tech_id,
        "id": tech_id,
        "essentials": tech_def.get("essentials", {}),
        "constraints": tech_def.get("constraints", {}),
        "costs": tech_def.get("costs", {}),
    })

MODEL_DATA = {
    "name": "German Template E2E Test",
    "locations": LOCATIONS,
    "links": LINKS,
    "technologies": TECHNOLOGIES,
    "locationTechAssignments": {},   # template scenario — intentionally empty
    "parameters": [
        {"key": "subset_time_start", "value": "2005-01-01"},
        {"key": "subset_time_end",   "value": "2005-01-07"},
    ],
    "solver": "cbc",
}

# ---------------------------------------------------------------------------
# 1. Health
# ---------------------------------------------------------------------------
print("\n1. Health check …")
with urllib.request.urlopen(f"{BASE}/health") as r:
    health = json.loads(r.read())
    print("   OK —", health)

# ---------------------------------------------------------------------------
# 2. Submit
# ---------------------------------------------------------------------------
print("\n2. Submitting German template model …")
payload = json.dumps(MODEL_DATA).encode()
req = urllib.request.Request(f"{BASE}/run", data=payload,
                              headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req) as r:
    job = json.loads(r.read())
    job_id = job["job_id"]
    print("   Job ID:", job_id)

# ---------------------------------------------------------------------------
# 3. Stream SSE
# ---------------------------------------------------------------------------
print("\n3. Streaming results …")
result = None
stream_url = f"{BASE}/run/{job_id}/stream"
req2 = urllib.request.Request(stream_url, headers={"Accept": "text/event-stream"})

with urllib.request.urlopen(req2, timeout=300) as resp:
    buf = ""
    for raw in resp:
        line = raw.decode("utf-8").rstrip("\n")
        if not line:
            if buf.startswith("data:"):
                data_str = buf[5:].strip()
                try:
                    evt = json.loads(data_str)
                except Exception:
                    buf = ""
                    continue
                if evt.get("type") == "log":
                    print(" ", evt["line"])
                elif evt.get("type") == "done":
                    result = evt.get("result", {})
                    break
                elif evt.get("type") == "error":
                    print("ERROR:", evt.get("error"))
                    break
            buf = ""
        elif line.startswith("data:"):
            buf = line
        else:
            buf += "\n" + line

# ---------------------------------------------------------------------------
# 4. Results
# ---------------------------------------------------------------------------
print("\n--- RESULT ---")
if not result:
    print("  No result received!")
else:
    print(f"  success             : {result.get('success')}")
    print(f"  termination         : {result.get('termination_condition')}")
    print(f"  objective           : {result.get('objective')}")

    caps = result.get("capacities", {})
    print(f"  capacities ({len(caps)} techs):")
    for k, v in sorted(caps.items()):
        if v and v > 0.001:
            print(f"    {k}: {v:.2f} MW")

    cbt = result.get("costs_by_tech", {})
    print(f"  costs_by_tech ({len(cbt)}):", json.dumps(cbt, indent=4) if cbt else "{}")

    cbl = result.get("costs_by_location", {})
    print(f"  costs_by_location ({len(cbl)} locs):")
    for loc, costs in cbl.items():
        total = sum(costs.values())
        print(f"    {loc}: total={total:.1f}")

    gen = result.get("generation", {})
    total_gen = sum(v for v in gen.values() if isinstance(v, (int, float)) and v > 0)
    print(f"  total generation    : {total_gen:.1f} MWh")

    dispatch = result.get("dispatch", {})
    timestamps = result.get("timestamps", [])
    print(f"  dispatch techs      : {list(dispatch.keys())}")
    print(f"  timestamps          : {len(timestamps)} steps")
    demand_ts = result.get("demand_timeseries", [])
    print(f"  demand_timeseries   : {len(demand_ts)} steps")

    if result.get("success") and result.get("termination_condition") in ("optimal", "feasible"):
        print("\nSUCCESS — German template model works correctly")
    else:
        print("\nFAILURE — unexpected result")
