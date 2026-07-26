# AH Note

Public stock research notes website for A-share and Hong Kong stock reports.

## Build

The published site is static. Local source inputs live under `_source/` and are
ignored by git.

```bash
python3 scripts/build_site.py
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/` to preview.

Published pages:

- `/` - ranking tables
- `/reports/` - report list
- `/reports/<code>/` - full report
- `/reference/` - calculation and field reference
