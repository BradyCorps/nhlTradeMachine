# V3 production QA

Validated on 2026-07-30 with:

```bash
node source/validate-kit.mjs
```

## Results

- Every production SVG rendered successfully.
- Every JSON file parsed successfully.
- No zero-byte files remained.
- Required PNG and ICO dimensions passed.
- PWA manifest references resolve to packaged files.
- The optimized primary contains the exact V3 viewBox, path, polygon, line, puck, and colour values.
- Original-to-production alpha/geometry RMSE: `0` (identical silhouette and placement).
- Original-to-production full-colour RMSE: `0.00125088` after texture compression.
- Approved wordmark SHA-256 remained `ace5ff9b685a76df43246d61227972dc54e807752022e619313b7729b76ae086`.
- Approved ampersand SHA-256 remained `52dadd1a56145f8241623b14bca736195bf3ffb4b9b14a8bad6268d21ce29f20`.

## Master and optimized files

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `source/master/cap-and-crease-brady-createdV3-original.svg` | 7,571,368 | `2156b18adfa1d82143fb94daf9a7a97d8cde7c86052445bb633dc7959e19a11f` |
| `assets/svg/cap-and-crease-mark-primary.svg` | 221,065 | `fa470f3ed38d71f02d9987eab9d7dffddbafdeeee193428c8e19244fd0d5329f` |
| `source/texture/paper-texture-1024.jpg` | 163,797 | `43990958ee3552bcd1bac764e773b9f35aeea6f28e415f2f2840d0625af40b75` |

The archived master is intentionally retained for editing. The 221 KB optimized SVG is the production asset.
