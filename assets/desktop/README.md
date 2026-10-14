# Caelestia desktop assets

All assets are served locally. No font CDN, wallpaper service, authentication service or system process is used at runtime.

| Local file | Source | License / changes |
| --- | --- | --- |
| `wallpaper.png`, `avatar.jpg`, `dino.png` | [caelestia-sddm Locklike assets](https://github.com/ItsABigIgloo/caelestia-sddm/tree/dd69abbb7eb122546cbabe84e116ba03e67a4ccc/themes/locklike/assets) | Unmodified; repository GPL-3.0, included as `GPL-3.0.txt` |
| `wallpaper-alt.webp` | [caelestia-shell wallpaper](https://github.com/caelestia-dots/shell/blob/a3a8fe59aba2c0048ab02dc817748678f96076ff/assets/wallpaper.webp) | Unmodified; repository GPL-3.0 |
| `GoogleSansFlex.woff` | [Caelestia's bundled Google Sans Flex](https://github.com/caelestia-dots/shell/tree/a3a8fe59aba2c0048ab02dc817748678f96076ff/assets/google-sans-flex) | SIL OFL 1.1; WOFF subset retaining Latin, punctuation and used symbols; `GoogleSansFlex-LICENSE.txt` |
| `Clock.woff` | Same Google Sans Flex source | Digits instance: `wdth=30`, `wght=500`, `opsz=144`, `ROND=25`, `GRAD=0`, `slnt=0`; SIL OFL 1.1 |
| `Rubik.ttf` | [Google Fonts Rubik](https://github.com/google/fonts/tree/main/ofl/rubik) | Unmodified variable font; SIL OFL 1.1, `Rubik-OFL.txt` |
| `CaskaydiaCove.woff` | [Nerd Fonts Cascadia Code](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/CascadiaCode) | WOFF subset retaining Latin, punctuation and used symbols; SIL OFL 1.1, `CaskaydiaCove-LICENSE.txt` |
| `MaterialSymbolsRounded.woff2` | [Google Material Symbols Rounded](https://github.com/google/material-design-icons/tree/master/variablefont) | Unmodified variable font; Apache 2.0, `MaterialSymbols-LICENSE.txt` |

The UI geometry, surface hierarchy, typography and motion are adapted from [Caelestia Shell](https://github.com/caelestia-dots/shell/tree/a3a8fe59aba2c0048ab02dc817748678f96076ff) and [SDDM Locklike](https://github.com/ItsABigIgloo/caelestia-sddm/tree/dd69abbb7eb122546cbabe84e116ba03e67a4ccc/themes/locklike), both carrying GPL-3.0 license texts. The Canvas implementation is a local visual simulation, with native browser inputs and no QML/PAM/Wayland execution.

The two font subsets and clock instance were prepared with fontTools, using Unicode U+0020–024F, U+2000–206F and the displayed currency/arrows/symbols. Original font license notices are retained. Font processing is an asset preparation step; running the site does not require Python or a build.

## Display assets

The original files above remain the source assets. The site serves these prepared derivatives:

- `GoogleSansFlex.woff2`, `Clock.woff2`, `Rubik.woff2`, `CaskaydiaCove.woff2`: WOFF2 conversions retaining the original character coverage and variable axes.
- `MaterialSymbolsRounded.subset.woff2`: the 34 icon ligatures used by the canvas UI, including aliases such as `notifications_none`. Variable axes and used glyph outlines are retained; the preparation script checks the ligatures and outlines against the original font.
- `wallpaper-display.webp`: a 1200 × 675 lossless WebP derivative of `wallpaper.png` for the fixed desktop canvas.
- `wallpaper-alt-display.webp`: a 1600 × 675 lossless WebP derivative retaining the alternate source's aspect ratio and centered cover behavior.

All derivatives carry their source licenses listed above. Prepare them with Python 3 and `fonttools`, `brotli`, and `pillow`:

```sh
python -m pip install fonttools brotli pillow
python scripts/prepare-desktop-assets.py
```

Font preparation preserves source timestamps for repeatable output. The script reads only the bundled source files. Originals are never overwritten. The initial desktop requests its selected wallpaper and body/icon/bar-clock fonts; optional wallpaper, avatar, dinosaur and authentication/terminal fonts load when used. Plymouth's original frame assets and lazy loading are unchanged.
