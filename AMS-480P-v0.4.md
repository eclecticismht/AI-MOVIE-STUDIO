# AMS v0.4.0-alpha.3 — 480p director workflow

This change adds a real 480-line working-output tier. It does not declare full episodes completed or remove inspection requirements.

## Resolution contract
- Existing local H3 generation uses a32-pixel grid: the selected landscape480p tier is864×480.
- Working MP4 delivery is854×480. Its rational sample aspect1280:1281 gives an exact16:9 display aspect; it is not native1080p or4K. FFmpeg filters must use `setsar=1280/1281:max=10000` to avoid rounding the value to1:1.
- Director frame/render requests inherit the selected project's dimensions unless the shot explicitly owns a validated override. Changing dimensions or visual guidance invalidates a prior first-frame inspection.
- The geometry-reference image uses actual selected dimensions, rather than labeling a1024×576 image as480p.
- Timeline export reports854×480 capability. The browser keeps this option disabled until the running service confirms support. Existing720p/1080p/1440p/2160p defaults and other projects remain unchanged.

## Director-to-render handoff
`director-render-bridge.js` validates the scene, all visible character references, the frame provenance, and a recorded actual-image inspection. A single speaking role does not remove the other silent cast members. A finite trial can be cloned without replacing existing media. It remains a candidate until motion/identity/lip-sync are reviewed; this is not automatic four-person conversation generation.

## Validation
Unit tests cover the new output profile, frame dimensions, source invalidation, legacy defaults, and explicit generation guards. A local installed-FFmpeg test encodes two synthetic test frames and reads them back to verify854×480 with SAR1280:1281/DAR16:9. These synthetic frames are test fixtures only, never episode content. The user-project content, references, logs and media are excluded from Git.

## Story revision boundary
When a project's opening is rewritten, original clips and scripts remain historical records. Work must follow the active editorial revision, not simply reduce resolution on an obsolete-dialogue video. Geometrically useful neutral references may be reused after inspection; old speech and corresponding mouth motion cannot be silently relabeled as new dialogue. Existing large-resolution prologue footage can be downsampled through the timeline exporter without another model render.
