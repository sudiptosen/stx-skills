# Image Resize Skill — Research & Design

This document captures the research findings and design decisions behind `/stx-image`.

## Problem statement

As projects accumulate marketing assets, screenshots, and logos, individual image files grow to multiple megabytes and total asset directories can push 50+ MB. Two costs follow:

1. **AI context bloat.** When Claude Code reads an image, the cost scales with pixel area. Images above ~1568 px longest edge are downscaled internally before processing, so excess resolution is pure waste. File-size also impacts uploads and caching.
2. **Dead assets.** Marketing redesigns and refactors leave images behind that are no longer referenced. Nobody notices until CI caches or container images balloon.

A one-shot `sips -Z …` command is fast but lacks rigor — it doesn't tell you *why* to resize, or distinguish between referenced and abandoned images.

## Research findings

### Claude Vision input behavior

Anthropic's image processing resizes images to fit within a 1568 px longest edge before converting to tokens. Beyond that cap:

- Upload bandwidth is wasted.
- Cache entries are larger than they need to be.
- The visible quality at the cap is identical to the original.

Sources:
- [Anthropic docs: Vision](https://docs.anthropic.com/en/docs/build-with-claude/vision) — documents the 1568 px cap and tokens-per-image formula.

### `sips` as the resize tool

`sips` ("scriptable image processing system") ships with macOS, requires no install, and handles all common raster formats. Its `-Z <n>` flag resizes so the longest edge equals `n`, preserving aspect ratio. It writes in place.

Pros:
- Zero dependencies on a Mac.
- Preserves ICC profiles by default.
- Scriptable and fast (<100ms per image for typical sizes).

Cons:
- Not cross-platform — Linux CI boxes need `imagemagick` or `vipsthumbnail`.
- Destructive by default (overwrites). We mitigate by requiring `--apply`.

### Logo / icon heuristic

Files matching `/logo|icon|favicon|avatar/i` are almost always rendered at ≤256 px in UI. Targeting 512 px (2x retina) gives more than enough fidelity for a 256 px rendered size. A 2048×2048 logo at 90 KB drops to ~15 KB at 512×512.

### Reference detection trade-offs

| Approach | Coverage | Cost |
|---|---|---|
| Grep basename per image | ~95% | N greps × M files |
| Concat-and-scan | ~95% | 1 read × M files |
| AST import resolution | ~99% | Heavy, language-specific |
| Runtime coverage data | 100% | Requires instrumentation |

**Chosen: concat-and-scan.** One pass over source files into a single in-memory blob, then `blob.includes(basename)` per image. This is O(M + N·|blob|) but in practice fast enough for projects up to ~100K source files. It catches everything grep would, with a single disk pass.

What it misses:
- `` `${variant}.png` `` — constructed strings.
- Backend-served images (CMS, DB).

These cases are rare in frontend asset directories; the fallback is manual review of the "unused" list.

## Design decisions

### 1. Analyze-only by default

Per the organization's data-protection rule, destructive operations require explicit user approval. Default mode prints a report and exits with no file changes. `--apply` is required to resize; `--apply --delete-unused` is required to delete, and prompts before deletion unless `--force` is passed.

### 2. Target tables that mirror manual review

The report is modeled on the manual review format a reviewer would produce: separate sections for "delete entirely" and "resize", with a `Why` column in the resize section. This lets a reviewer approve, modify, or reject each row independently.

### 3. Conservative thresholds

- `500 KB` for file size and `1568 px` for longest edge catch the assets that actually cost AI-context tokens without sweeping in images that are already in an acceptable range.
- Thresholds are overridable (`--size-kb`, `--max-dimension`) for stricter or looser scans.

### 4. SVG is flagged, not auto-resized

Large SVGs almost always contain embedded rasters or inefficient paths. `sips` cannot resize SVGs. We surface them with a suggestion to run SVGO or replace with an optimized raster, rather than pretend we can handle them.

### 5. Estimated savings

The "Target" column shows an estimated post-resize byte size (scaled by the area ratio). This is an approximation — actual savings depend on content — but it's accurate to ±30% for typical photographs and screenshots and gives reviewers a basis for "is this worth doing".

## Architecture

```
stx-image.ts
├── Constants (extensions, ignored dirs, thresholds)
├── CLI parsing (parseArgs, showHelp)
├── Walking (walk generator)
├── Dimension detection
│   ├── getRasterDimensions (sips)
│   └── getSvgDimensions (regex)
├── Reference detection
│   ├── buildReferenceBlob (one-pass concat)
│   └── isReferenced (substring check)
├── Analysis (analyzeImage → ImageReport)
├── Report rendering
│   ├── renderTable (unicode box tables)
│   └── renderReport (sections + commands)
└── Apply phase
    ├── confirm (readline prompt)
    └── applyChanges (sips + rm with confirmations)
```

## Future enhancements

- **Linux support.** Swap `sips` for `vipsthumbnail` / `convert` when not on macOS.
- **Per-file sip / SVGO.** Automatic SVG optimization via SVGO as an opt-in.
- **Pre-commit integration.** Fail the commit if new images exceed thresholds.
- **Usage context.** Parse JSX/TSX to identify the rendered width (e.g., `<Image width={220} src="logo.png"/>`) and tune target accordingly.
- **Next.js / Vite asset awareness.** Understand public/ vs src/assets/ conventions to avoid false "unused" flags for images loaded via framework conventions.

## References

- [Anthropic — Vision docs](https://docs.anthropic.com/en/docs/build-with-claude/vision)
- [Apple `sips` man page](https://ss64.com/osx/sips.html)
- [SVGO — SVG optimizer](https://github.com/svg/svgo)
- [vipsthumbnail](https://www.libvips.org/API/current/Using-vipsthumbnail.html)
