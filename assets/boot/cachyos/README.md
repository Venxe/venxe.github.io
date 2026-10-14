# CachyOS Plymouth artwork

Original, unmodified PNG frames from [CachyOS/plymouth-theme](https://github.com/CachyOS/plymouth-theme/tree/29a5d7648fbe32ee4ea241919f14363be0a98903/cachyos-bootanimation), commit `29a5d7648fbe32ee4ea241919f14363be0a98903`.

- `animation-00.png` through `animation-87.png`: 88 logo frames, 300 × 300.
- `throbber-00.png` through `throbber-40.png`: 41 waiting frames, 65 × 65.
- `manifest.json`: source revision, dimensions and SHA-256 for each original file.

The [official package definition](https://github.com/CachyOS/CachyOS-PKGBUILDS/blob/master/cachyos-plymouth-bootanimation/PKGBUILD) declares `license=("GPL")`. The source revision does not contain a LICENSE/COPYING file or specify a GPL version. This notice records the upstream declaration without assigning an unsupported version. Artwork belongs to its upstream authors.

The theme uses Plymouth's `two-step` plugin with a centered black background and `UseEndAnimation=true` on boot. The site reproduces the throbber followed by the one-shot end animation at 30 FPS, including transparent/blank frames. The two-second wait and final 300 ms hold are simulation timings; actual startup duration depends on hardware and configuration. No third-party request is made at runtime.
