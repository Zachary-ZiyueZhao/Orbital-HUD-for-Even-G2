# HUD native-size bitmap font

`dashboard-native.g2font.json` is a local bitmap font used to animate HUD cards.
It is not an official TTF/OTF or a complete export of the glasses firmware font.

- Source renderer: official `@evenrealities/evenhub-simulator` **0.9.5** (npm package metadata: MIT).
- Metrics and kerning: official `@evenrealities/pretext` **0.1.4** (MIT).
- Source resolution: **576 × 288**, `textColor: 4`, no glow, no borders or padding around individual glyphs.
- Coverage: 660 captured glyphs, including the Latin and Cyrillic/Greek metric tables, three additional printable characters, and the seven Chinese characters used by the information and empty to-do cards.
- Format: `[left, top, width, height, base64 Gray8 coverage]` per Unicode code point; native **27 px** line height, **1:1** pixel size.
- The framebuffer's **alpha** channel stores coverage. RGB is the simulator's green display color and is not used as font luminance.
- Runtime draws coverage bytes directly into Gray8 card buffers at integer positions. It does not rescale glyphs, apply browser fonts, or change text layers during animation.
- Unsupported text uses SDK native text instead. Card transitions involving that text switch directly, so missing characters are never replaced with unrelated glyphs.
- The simulator documentation explicitly notes that font rendering may differ from hardware. This resource matches the captured simulator version; pixel equality with a particular glasses firmware or the system Dashboard is not guaranteed.

## Re-export

Start `npm run dev -- --host 127.0.0.1 --port 5188 --strictPort`, then launch the official simulator:

```text
evenhub-simulator http://127.0.0.1:5188/scripts/capture-dashboard-font.html --automation-port 9900 --no-glow
```

From the project root, run:

```text
node scripts/export-dashboard-font.mjs
```

The exporter reads each native framebuffer after the corresponding batch is painted, saves source PNGs in ignored `.hud-preview/native-font-source/`, and writes the font file. To regenerate from a complete cache with the same codepoint order without running the simulator, use `--from-cache`.

For an incremental extension, append codepoints to `scripts/font-codepoints.json`, open the capture page with `?points=` followed by the comma-separated missing codepoints in the same order, and run the exporter with `--extend`. Existing glyphs are preserved; additional source frames are stored in the `extension/` cache directory. Full re-export uses the normal command and captures the complete updated codepoint list.

Official references:

- https://www.npmjs.com/package/@evenrealities/evenhub-simulator
- https://www.npmjs.com/package/@evenrealities/pretext
