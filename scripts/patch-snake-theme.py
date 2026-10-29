"""Patch snake-and-commits themes for GitHub light/dark grids + coral snake."""

from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else "generate.py")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        """    "green": dict(
        levels=["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
        snake="#39d353", head="#b7ffd0",
        ramp=[(1, "#8affc1"), (4, "#39d353"), (10, "#26a641"), (21, "#006d32")],
        text="#7d8590", frame_bg="#0d1117", frame_border="#30363d",
    ),""",
        """    "green": dict(
        levels=["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
        snake="#ff7b72", head="#ffd8d3",
        ramp=[(1, "#ffd8d3"), (4, "#ff7b72"), (10, "#f85149"), (21, "#da3633")],
        text="#57606a", frame_bg="#ffffff", frame_border="#d0d7de",
    ),""",
    ),
    (
        """    "matrix": dict(
        levels=["#0a0f0a", "#0d3d1a", "#12742f", "#1fb84e", "#39ff7a"],
        snake="#39ff7a", head="#d6ffe4",
        ramp=[(1, "#d6ffe4"), (4, "#39ff7a"), (10, "#1fb84e"), (21, "#12742f")],
        text="#3fa060", frame_bg="#000000", frame_border="#123d1f",
    ),""",
        """    "matrix": dict(
        levels=["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
        snake="#ff7b72", head="#ffd8d3",
        ramp=[(1, "#ffd8d3"), (4, "#ff7b72"), (10, "#f85149"), (21, "#da3633")],
        text="#7d8590", frame_bg="#0d1117", frame_border="#30363d",
    ),""",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"theme patch failed, pattern not found:\n{old}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print(f"patched {path}")
