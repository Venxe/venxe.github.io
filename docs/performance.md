# Performance changes and verification

Measured on 2026-10-14 against commit `73ca05a204ea073fa5c38d5d59c99be9d50b7612`. The visual design, model openings, animation durations, desktop controls, shadow quality, 1200 × 675 desktop texture and 1.5 DPR cap are retained.

## Results

Five runs per viewport, with network cache disabled, using headless Edge/Chromium and an AMD Radeon integrated GPU through ANGLE/D3D11. Desktop: 1440 × 900; phone viewport: 390 × 844; DPR 1 for both. The table reports medians. Raw samples and renderer statistics remain in the ignored `.preview/performance/` directory (`baseline-isolated.json`, `optimized-isolated.json`, both `*-stress.json` files and `summary.json`); runtime outputs are not added to source control.

| Measurement | Before | After |
| --- | ---: | ---: |
| Initial requested resource bytes | 16.32 MB | 2.92 MB |
| Icon font file | 5,397,756 bytes | 38,980 bytes |
| Wallpaper files used by the UI | 7,568,943 bytes | 745,446 bytes |
| Idle screen renders per second, desktop | 145 | 0 |
| Dashboard native DOM mutations per second | 4,806 | 0 |
| Recursive raycasts for 40 laptop mouse moves | 80 | 40 |
| Grille geometry and instance buffers | 2,308,992 bytes | 57,012 bytes |
| Total model triangles | 44,219 | 46,893 |
| Full-scene draw calls, excluding an updated shadow pass | 64 | 65 |
| GPU texture count | 4 | 4 |

Initial transfer fell by approximately 82%. The alternate wallpaper, avatar and dinosaur no longer load on the initial desktop. Authentication and terminal fonts load when needed. Original source assets remain bundled for reproducible preparation and license attribution, but are not requested by the optimized UI.

The screen render median is zero when unchanged. One desktop sample crossed a minute boundary and correctly drew once; clock, input, asset completion and timed-state changes still wake the renderer. Dashboard canvas/texture updates remain active at no more than 20 Hz without rebuilding its native controls. Full scene views retain continuous steam animation.

The scene's `aria-busy=false` marker was reached in a median 435 ms before / 341 ms after on desktop, and 336 ms before / 250 ms after at the phone viewport. This measures initialization readiness, not fully decoded fonts/images or completed GPU presentation. These timings are environment-dependent and do not justify a universal loading-time promise.

## Grille tradeoff

The former grille triangulated 666 holes together at startup. The replacement instances a single perforated cell and adds the unchanged outer frame. Internal cell/frame joining walls are removed; the pores remain real openings, with the same circle sampling, diameter, spacing and material.

Buffer storage fell by 97.5%. Six construction samples in separate fresh Node processes measured laptop body construction at 78–195 ms before / 8–48 ms after; the first calls were 195 ms / 48 ms. This includes common Three.js initialization/JIT work and is an isolated CPU construction measurement, not browser FPS. The repeatable check is `node scripts/benchmark-models.mjs`; `PERF_SITE_ROOT` can select a baseline checkout.

The grille adds 2,674 triangles and one draw call; whole-model triangle count increases 6.0%, below the agreed 10% ceiling. Runtime stress checks did not show a frame-cadence regression:

| Median of five p95 samples | Before | After |
| --- | ---: | ---: |
| Desktop camera orbit frame interval | 7.0 ms | 7.0 ms |
| Desktop lid-close frame interval | 7.1 ms | 7.1 ms |
| Desktop camera orbit GPU duration | 4.58 ms | 4.67 ms |
| Desktop lid-close GPU duration | 4.59 ms | 4.73 ms |
| Phone viewport orbit frame interval | 7.0 ms | 7.0 ms |
| Phone viewport lid-close frame interval | 7.1 ms | 7.1 ms |
| Phone viewport orbit GPU duration | 4.14 ms | 4.13 ms |
| Phone viewport lid-close GPU duration | 4.05 ms | 4.00 ms |

The small GPU-duration differences overlap the observed run variation. The reason to retain the grille change is much less construction work and buffer storage, not a claim of faster GPU rendering. The stress test includes camera movement and shadow updates during lid motion. GPU times use non-blocking disjoint timer queries, excluding disjoint results.

## Runtime changes

- One pending animation frame handles input and active animations; one timer handles the nearest deadline when static. Both stop on visibility loss, context loss and page hide. Camera transitions pause while hidden; system and boot transitions catch up by wall time.
- `desktop.update(time)` reports whether the canvas was painted. `desktop.setInvalidate(callback)` wakes the scene after UI, font and image changes. `desktop.nextUpdateAt` and `system.nextUpdateAt` expose epoch-millisecond deadlines or `null`.
- Keyboard/webcam movement, lid brightness transitions and shutdown dimming report active animation. Display-only changes do not force a hinge shadow refresh.
- Resource and animation paints reuse the existing layout. Native control attributes/properties are only written when changed. Boot animation frames do not recreate menu controls.
- Picking results are shared within an input event. Hover moves are coalesced to the latest position per animation frame; presses, releases, dragging and power cancellation remain immediate. Occlusion and the padded lid-notch validation ray are preserved.

No runtime dependency, bundler, worker, LOD, adaptive resolution, shader downgrade, shadow downgrade, service worker or remote asset service was added. The optional Python preparation tools are not needed to run the site.

## Validation and limits

`npm run check` passes, including geometry/clearance/opening checks, animation reversals, display wake after hinge settling, boot deadlines, power holds, cancellation, reduced motion, view gestures, keyboard input, native desktop controls, resource budgets, paused/resumed tabs, context loss and disposal. Performance regressions check idle GPU work, input wake, clock/OSD deadlines, hover coalescing and hidden-camera pause through the public interfaces.

Real-browser checks passed at 1440 × 900, 390 × 844, 844 × 390 and 320 × 568 with both motion preferences. They exercised wallpapers, native controls, lid gating, masked credential rejection, shutdown, boot selection and completed login handoff. Screenshots were captured for baseline and optimized versions and inspected. The desktop chassis comparison differed by at most two channel levels; the phone login screenshot had a mean absolute channel difference of 0.003/255. Wallpaper derivatives introduce minor resampling differences while preserving framing, colors and visible detail. Font preparation verifies every used icon's ligature and default outline against its source.

Run the optional checks with:

```sh
npm run profile -- current
node scripts/profile-browser.mjs current-stress --stress
node scripts/check-browser.mjs current
node scripts/benchmark-models.mjs
```

Set `PERF_BROWSER` for a different Chromium executable and `PERF_SITE_ROOT` for a baseline checkout. Profile/browser results and screenshots stay under ignored `.preview/` paths. A separate server prevents an existing development server from contaminating comparisons. Instrumentation is injected only into the isolated test browser's local module response; production code has no profiler.

Phone viewport emulation uses the desktop GPU; physical phone FPS, thermal behavior, battery consumption, Safari/Firefox and screen-reader output were not measured. `renderer.info.memory` contains resource counts, not total GPU bytes. Render intervals in sleeping modes describe scheduled updates and must not be interpreted as low FPS. Driver caches, CPU scheduling and profile instrumentation affect absolute timings. No deployment was performed.
