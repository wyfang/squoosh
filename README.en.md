# Squoosh

A personal modification of GoogleChromeLabs Squoosh for batch image compression, conversion, and comparison in the browser, with a workbench built using React 19, HeroUI 3, Tailwind CSS 4, and Vite 7.

[Use online](https://play.wangyifang.com/squoosh/) · [Upstream project](https://github.com/GoogleChromeLabs/squoosh) · [简体中文](./README.md)

## Features

- Drop, paste, or select multiple images and automatically switch to a newly added image. Apply the current settings to the entire queue.
- Export WebP, JPEG (MozJPEG), AVIF, or PNG (OxiPNG). Keep adjusting quality and other settings during compression; results are regenerated using the latest settings.
- Adjust output dimensions with a HeroUI slider or percentage input from `1%` to `100%` in `1%` increments. Use `25%`, `50%`, `75%`, and `100%` presets while scaling width and height together.
- Switch between original, comparison, and result views, and drag the divider to inspect differences. Zoom with the mouse, magnify a selected area, and pan the image.
- View before-and-after file sizes, size ratios, and increases or savings for individual images and the queue. Download individual files or export completed results as a ZIP archive.
- Blue accents with dark and light themes and a saved theme preference. The interface uses HeroUI React components, with image decoding and encoding performed in browser workers.

## Usage

Requires Node.js 22.12.0 or later and a modern browser with WebAssembly, Web Worker, and OffscreenCanvas support. Current versions of Chrome, Edge, Firefox, or Safari are recommended; supported inputs also depend on the browser's image decoding capabilities.

```bash
npm ci
npm run dev -- --port 5178 --strictPort
```

Open `http://127.0.0.1:5178/squoosh/`. If the port is occupied, change `--port` and try again.

```bash
npm run typecheck
npm run build
npm run preview -- --port 4178 --strictPort
```

The build preview is available at `http://127.0.0.1:4178/squoosh/`. Build output is written to `dist/`, with the asset base path set to `/squoosh/`. Builds reuse the Squoosh WASM encoders retained in the repository; rebuilding each codec locally is not required.

Use the following canvas controls. Keyboard shortcuts do not take over input while an input field is focused. Canvas zoom only changes the preview; the size controls in the right panel determine the exported pixel dimensions.

| Action | Result |
| --- | --- |
| Mouse wheel | Zoom around the pointer |
| Hold `Z` and click | Zoom in |
| Hold `Z` + `Alt` and click | Zoom out |
| Hold `Z` and drag | Select an area to magnify |
| Hold Space and drag, or drag with the middle mouse button | Pan the image |
| `Shift` + `1` | Fit the image to the canvas |
| `Shift` + `0` | Display original pixels at `1:1` |
| `Esc` | Cancel the current selection box |

## Notes

Supported inputs are static PNG, JPEG, WebP, AVIF, and BMP images. Animation is not supported. Each queue accepts up to 30 images and 100 MB of input data in total. Each image is limited to 40 MB, 25 million pixels, and 16383 pixels on either edge. Available browser or device memory may impose further limits; AVIF encoding generally takes longer.

Images are processed in the current browser. This workbench does not upload originals or converted files. The theme preference is saved locally in the browser; reloading or closing the page clears the image queue, so download any results you need to retain. The production host also loads analytics and Cloudflare security scripts; the site as a whole is not an offline-only page.

The modification starts from upstream commit `e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3`. Original application sources and codecs remain in `src/`, `codecs/`, and the other original directories. The original documentation and dependency configuration are preserved as [README.upstream.md](./README.upstream.md), [package.upstream.json](./package.upstream.json), and [package-lock.upstream.json](./package-lock.upstream.json). The current entry point is in `workbench/`; `npm run build` builds the new workbench.

CI in this source repository installs dependencies and validates the build on Linux and Windows; it does not deploy. Production publishing is handled by the separate `play.wangyifang.com` site repository. Its `sync:squoosh` script copies this repository's `dist/` into the site's `squoosh/` directory; committing and pushing the site changes to `main` then triggers automatic deployment through Cloudflare Workers Builds.

## License

Upstream Squoosh is maintained by GoogleChromeLabs and contributors under the [Apache License 2.0](./LICENSE). This repository retains the upstream license and source attributions and identifies the workbench as a modification. Codecs, React, HeroUI, and other third-party dependencies remain under their respective licenses; complete attribution texts are distributed with the build in [THIRD_PARTY_NOTICES.txt](./public/THIRD_PARTY_NOTICES.txt).

This software is based in part on the work of the Independent JPEG Group.

The code license does not grant additional rights to project names, trademarks, or user images.
