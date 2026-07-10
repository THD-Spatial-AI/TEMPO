"""
Driver executed inside an engine venv by verify_dual_engine.py.

    python scripts/run_engine_driver.py <runner_module> <payload.json> <out.json>

Loads the payload, runs it through the given runner module
(calliope_runner or calliope07_runner), and dumps the result JSON.
"""

import json
import math
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "python"))


def _sanitize(obj):
    """inf/nan are not valid JSON — replace like the service layer would."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def main():
    runner_module, payload_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    import importlib
    runner = importlib.import_module(runner_module)

    payload = json.loads(Path(payload_path).read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory() as work_dir:
        result = runner.run_model(payload, work_dir,
                                  log_fn=lambda line: print(line, flush=True))
    Path(out_path).write_text(json.dumps(_sanitize(result)), encoding='utf-8')
    print(f"[driver] result written to {out_path}", flush=True)


if __name__ == '__main__':
    main()
