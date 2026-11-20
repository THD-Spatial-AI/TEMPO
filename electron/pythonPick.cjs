// Which system Pythons may host an engine venv.
//
// The pinned stacks (pandas 2.2, numpy, scipy, shapely...) publish wheels for
// 64-bit CPython 3.10-3.13 only. On a newer or 32-bit interpreter pip compiles
// from source, which fails without a C++ toolchain ("Microsoft Visual C++ 14.0
// or greater is required", "Could not find vswhere.exe"). So a Python outside
// that range is treated as not found, and Windows downloads its own.
const MAX_MINOR = 13;

const PROBE_CODE = 'import sys,struct;print(sys.version_info[0],sys.version_info[1],struct.calcsize("P")*8)';

function parseProbe(out) {
  const [major, minor, bits] = String(out).trim().split(/\s+/).map(Number);
  return [major, minor, bits].every(Number.isFinite) ? { major, minor, bits } : null;
}

function isUsable(info, minMinor = 10) {
  return !!info && info.major === 3 && info.minor >= minMinor && info.minor <= MAX_MINOR && info.bits === 64;
}

/** Runs `cmd` and reports its version and pointer size, or null if it is not a working Python. */
function probePython(cmd, execFileSync) {
  try {
    const out = execFileSync(cmd, ['-c', PROBE_CODE], { timeout: 8000, stdio: ['ignore', 'pipe', 'pipe'] });
    return parseProbe(out);
  } catch {
    return null;
  }
}

module.exports = { MAX_MINOR, parseProbe, isUsable, probePython };
