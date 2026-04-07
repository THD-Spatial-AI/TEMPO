"""
End-to-end test for the Calliope Docker web service.
Run:  python test_docker_service.py
"""

import json
import sys
import urllib.request
import urllib.error

SERVICE = "http://localhost:5000"

MINIMAL_MODEL = {
    "name": "Docker E2E Test",
    "solver": "highs",
    "locations": [
        {"id": "Berlin", "lat": 52.52, "lng": 13.40},
        {"id": "Munich", "lat": 48.14, "lng": 11.58},
    ],
    "technologies": [
        {
            "name": "solar_pv",
            "essentials": {
                "name": "Solar PV",
                "parent": "supply",
                "carrier_out": "electricity",
            },
            "constraints": {
                "energy_cap_max": 500,
                "resource": 4.5,
                "lifetime": 25,
            },
            "costs": {
                "monetary": {
                    "interest_rate": 0.05,
                    "energy_cap": 600000,
                }
            },
        },
        {
            "name": "demand_electricity",
            "essentials": {
                "name": "Electricity demand",
                "parent": "demand",
                "carrier": "electricity",
            },
            "constraints": {"resource": -100, "force_resource": True},
        },
    ],
    "locationTechAssignments": {
        "Berlin": ["solar_pv", "demand_electricity"],
        "Munich": ["solar_pv", "demand_electricity"],
    },
    "links": [
        {"from": "Berlin", "to": "Munich", "linkType": "hvac_overhead", "distance": 585}
    ],
    "parameters": [
        {"key": "subset_time_start", "value": "2005-01-01"},
        {"key": "subset_time_end",   "value": "2005-01-02"},
    ],
}


def _get(path):
    with urllib.request.urlopen(f"{SERVICE}{path}", timeout=10) as r:
        return json.loads(r.read())


def _post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{SERVICE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def _stream_sse(path):
    """Read SSE lines until a done/error event, return the parsed event."""
    req = urllib.request.Request(f"{SERVICE}{path}")
    with urllib.request.urlopen(req, timeout=180) as r:
        for raw in r:
            line = raw.decode().strip()
            if line.startswith("data:"):
                event = json.loads(line[5:].strip())
                etype = event.get("type")
                if etype == "log":
                    print(f"  LOG: {event.get('line', '')}")
                elif etype in ("done", "error"):
                    return event
    return {"type": "error", "error": "SSE stream ended without done/error event"}


def main():
    # 1. Health check
    print("1. Health check …")
    h = _get("/health")
    assert h.get("status") == "ok", f"Unexpected health response: {h}"
    print(f"   OK — {h}")

    # 2. Submit model
    print("\n2. Submitting model …")
    r = _post("/run", MINIMAL_MODEL)
    job_id = r.get("job_id")
    assert job_id, f"No job_id in response: {r}"
    print(f"   Job ID: {job_id}")

    # 3. Stream results
    print("\n3. Streaming SSE results …")
    event = _stream_sse(f"/run/{job_id}/stream")

    if event["type"] == "error":
        print(f"\nFAILED — service returned error: {event.get('error')}")
        tb = event.get("traceback", "")
        if tb:
            print(tb)
        sys.exit(1)

    result = event.get("result", {})
    print("\n--- RESULT ---")
    print(f"  success             : {result.get('success')}")
    print(f"  termination_condition: {result.get('termination_condition')}")
    print(f"  objective (total cost): {result.get('objective')}")
    print(f"  capacities          : {json.dumps(result.get('capacities', {}), indent=4)}")
    print(f"  costs_by_tech       : {json.dumps(result.get('costs_by_tech', {}), indent=4)}")
    print(f"  costs_by_location   : {json.dumps(result.get('costs_by_location', {}), indent=4)}")
    print("\nSUCCESS — Docker service working correctly.")


if __name__ == "__main__":
    main()
