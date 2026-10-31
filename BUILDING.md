# Building HF Convo Anywhere

These steps rebuild the extension exactly as it's published.

## Requirements

- Node.js 22 (any 22.x) and npm 10
- Any operating system (Windows, macOS or Linux)

## Build

```bash
npm ci
npm run build
```

`dist/` then holds the built extension. `content.js` and `options.js` are bundled and minified by webpack from the TypeScript in `src/` (configuration in `config/`). `manifest.json`, `options.html`, `options.css` and the icons in `assets/` are copied from `src/` unchanged.

The Firefox package's `manifest.json` is `src/manifest.json` plus the Firefox-only `browser_specific_settings` key, which `scripts/package.js` adds.

## Release packages

```bash
npm run package
```

This builds, then writes three zips to `releases/`:

- `hf-convo-anywhere-<version>-chrome.zip`: for the Chrome Web Store
- `hf-convo-anywhere-<version>-firefox.zip`: for Firefox Add-ons
- `hf-convo-anywhere-<version>-firefox-source.zip`: this source, for Firefox Add-ons' review

## Checks

```bash
npm run typecheck
npm test
npm run lint
```
