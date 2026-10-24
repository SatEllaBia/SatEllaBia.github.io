# SatEllaBia.github.io

Study notes on analog electronics, served by GitHub Pages at https://satellabia.github.io.

GitHub builds the site with Jekyll on every push, so there is nothing to install or run to publish.

## Add a note

1. Copy `NOTE_TEMPLATE.md` to `_notes/<short-name>.md`. The file name becomes the URL: `/notes/<short-name>/`.
2. Fill in the front matter (`title`, `subject`, `date`, `summary`) and write the note in Markdown.
3. Commit and push. The note appears on the home page and on `/notes/`, grouped by `subject`.

Notes can be Markdown (`.md`) or HTML (`.html`, with the same front matter). Maths is written as
`$$...$$` and rendered with KaTeX. Images go in `assets/img/`. An Anki deck goes in
`assets/anki/` and is linked from the note with `anki: /assets/anki/<file>.txt`, which adds a download button.

For richer notes, `assets/style.css` has an optional "note kit" (method cards, worked examples,
fine print boxes, schematic SVG classes). `_notes/diode-analysis.html` shows all of it.

## Files

| Path | What it is |
|---|---|
| `_config.yml` | Site name, tagline, GitHub user |
| `_notes/` | The notes |
| `_layouts/` | Page frame (`default.html`) and note page (`note.html`) |
| `index.html`, `notes/index.html`, `404.html` | Home, note list, not-found page |
| `assets/style.css` | All styling. Colours are tokens at the top |
| `assets/scope.js` | The oscilloscope header on the home page |
| `assets/site.js` | Text scramble, hover glitch, scroll reveal, formula ticker |

## Preview locally (optional)

```sh
gem install jekyll kramdown-parser-gfm
jekyll serve        # http://localhost:4000
```

Debug stills for the header: `/?mode=0` to `/?mode=4` freezes one waveform, and `/?mode=2&burst=1` shows a corrupted frame.

## Credits

The glitch style (slice tears, macroblocks, two-colour chroma split, text scramble) is inspired by
[SkinkEBravia.github.io](https://github.com/SkinkEBravia/SkinkEBravia.github.io). No code or content
was copied from it; that repository has no license, so only the idea is borrowed.
