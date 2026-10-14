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
