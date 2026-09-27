"""Exercise the real HTTP API and background scoring jobs of compose.demo.yml."""
import json
import os
import time
from urllib.parse import urlsplit

import httpx


def main():
    if urlsplit(os.environ.get("DATABASE_URL", "")).path != "/vvln_demo":
        raise SystemExit("Run this check inside the isolated demo backend (vvln_demo only)")
    with httpx.Client(base_url="http://localhost:8000", timeout=60) as client:
        def request(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()

        deadline = time.monotonic() + 30
        while True:
            try:
                health = request("GET", "/health")
                assert health == {"status": "ok", "app": "Harmonia"}, health
                break
            except httpx.TransportError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(.5)
        resolution = request("POST", "/api/v1/products/resolution/run", json={})
        matching = request("POST", "/api/v1/findings/match/run")
        assert matching["findings_matched"] == 18, matching
        presets = {p["name"]: p["id"] for p in request("GET", "/api/v1/scoring/presets")}
        job = request("POST", "/api/v1/scoring/comparisons", json={
            "scope": "preset", "baseline_id": presets["Balanced"],
            "candidate_ids": [presets["Active Exploitation"], presets["Business Impact"]],
        })
        deadline = time.monotonic() + 90
        while job["status"] in ("pending", "running") and time.monotonic() < deadline:
            time.sleep(.25)
            job = request("GET", f"/api/v1/scoring/jobs/{job['id']}")
        assert job["status"] == "completed", job
        summary = request("GET", f"/api/v1/scoring/comparisons/{job['id']}/summary")
        assert summary["details_available"] and not summary["is_inconsistent"], summary
        assert sum(summary["baseline"]["distribution"].values()) == 18, summary
        for candidate in summary["candidates"]:
            items = request("GET", f"/api/v1/scoring/comparisons/{job['id']}/items", params={"candidate_id": candidate["id"]})
            assert items["total"] == 18, items
        print(json.dumps({"resolution": resolution, "matching": matching, "comparison": summary}, indent=2))


if __name__ == "__main__":
    main()
