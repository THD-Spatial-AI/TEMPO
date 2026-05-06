"""
Patch calliope 0.6.8 get_var (backend/pyomo/util.py) for Pyomo 6.4+ compatibility.

In Pyomo 6.4+ multi-dimensional index sets are named 'SetProduct_OrderedSet'
(an internal class name) instead of the calliope-expected '<var>_index'.
The else-branch in get_var therefore produces ['SetProduct_OrderedSet'] as dims
instead of the actual set names, breaking rename_axis on the result Series.

Fix: when we land in the else-branch, try subsets() first (correct names);
only fall back to index_set().name if subsets() is empty (scalar/1-D set).
"""
import pathlib
import calliope

p = pathlib.Path(calliope.__file__).parent / "backend" / "pyomo" / "util.py"
src = p.read_text()

OLD = (
    "        else:\n"
    "            dims = [var_container.index_set().name]\n"
)
NEW = (
    "        else:\n"
    "            _subs = list(var_container.index_set().subsets())\n"
    "            dims = [i.name for i in _subs] if _subs else [var_container.index_set().name]\n"
)

patched = src.replace(OLD, NEW)
p.write_text(patched)
print("util.py", "patched" if patched != src else "already patched")
