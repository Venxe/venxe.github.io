"""Optional asset preparation: python -m pip install fonttools brotli pillow.

Original assets and licenses remain in assets/desktop. No build is needed to run the site.
"""
from pathlib import Path
import re
from fontTools import subset
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "desktop"

symbols = TTFont(ASSETS / "MaterialSymbolsRounded.woff2", recalcTimestamp=False)
def ligatures(font):
    reverse = {glyph: chr(code) for code, glyph in font.getBestCmap().items() if code < 128}
    names = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if lookup.LookupType == 7:
                table = table.ExtSubTable
            for first, entries in getattr(table, "ligatures", {}).items():
                for entry in entries:
                    letters = [first, *entry.Component]
                    if all(letter in reverse for letter in letters):
                        names["".join(reverse[letter] for letter in letters)] = entry.LigGlyph
    return names

named_glyphs = ligatures(symbols)
source = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "src").glob("*.js"))
# Match supported icon names anywhere in source literals, including arrays passed
# through shorthand { icon } properties and aliases such as notifications_none.
icons = sorted(set(re.findall(r"['\"]([a-z][a-z0-9_]+)['\"]", source)) & named_glyphs.keys())
assert {"calendar_month", "wifi_off", "progress_activity", "partly_cloudy_night", "logout"} <= set(icons)
options = subset.Options()
options.name_IDs = ["*"]
options.layout_features = ["*"]
# Explicit glyphs retain the named ligatures without pulling in every icon formed
# from the same letters. Preserve the variable axes and their original defaults.
options.layout_closure = False
worker = subset.Subsetter(options=options)
worker.populate(glyphs={named_glyphs[name] for name in icons}, text="".join(icons))
worker.subset(symbols)
symbols.flavor = "woff2"
symbols.save(ASSETS / "MaterialSymbolsRounded.subset.woff2")
prepared = TTFont(ASSETS / "MaterialSymbolsRounded.subset.woff2", recalcTimestamp=False)
prepared_names = ligatures(prepared)
assert set(icons) <= prepared_names.keys(), "An icon ligature was lost"
original = TTFont(ASSETS / "MaterialSymbolsRounded.woff2", recalcTimestamp=False)
for name in icons:
    before = original["glyf"][named_glyphs[name]].getCoordinates(original["glyf"])[0]
    after = prepared["glyf"][prepared_names[name]].getCoordinates(prepared["glyf"])[0]
    assert list(before) == list(after), f"Icon outline changed: {name}"

for original in ["GoogleSansFlex.woff", "Clock.woff", "Rubik.ttf", "CaskaydiaCove.woff"]:
    font = TTFont(ASSETS / original, recalcTimestamp=False)
    font.flavor = "woff2"
    target = ASSETS / (Path(original).stem + ".woff2")
    font.save(target)
    assert target.stat().st_size < (ASSETS / original).stat().st_size, original

for original, target, size in [
    ("wallpaper.png", "wallpaper-display.webp", (1200, 675)),
    ("wallpaper-alt.webp", "wallpaper-alt-display.webp", (1600, 675)),
]:
    with Image.open(ASSETS / original) as image:
        image = image.resize(size, Image.Resampling.LANCZOS)
        image.save(ASSETS / target, "WEBP", lossless=True, method=6, icc_profile=image.info.get("icc_profile", b""))

for name in ["MaterialSymbolsRounded.subset.woff2", "GoogleSansFlex.woff2", "Clock.woff2", "Rubik.woff2",
             "CaskaydiaCove.woff2", "wallpaper-display.webp", "wallpaper-alt-display.webp"]:
    print(f"{name}: {(ASSETS / name).stat().st_size:,} bytes")
print(f"Retained {len(icons)} icon ligatures: {', '.join(icons)}")
