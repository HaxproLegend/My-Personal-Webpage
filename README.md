# Aranya Datta — Portfolio

A personal portfolio built with the original charcoal and electric-lime visual style, animated geometric artwork, interactive theme switch, and scroll transitions.

## Run locally

Serve the folder over HTTP so the photobooth can read each JPEG's embedded EXIF data:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. The layout uses Tailwind from its CDN, and Google Fonts are loaded online; the page's animations and interactions are included in the HTML.

## Photobooth

Add each full-size JPEG under `assets/photobooth/`, then add its preview and original paths to `photoArchive` in `photobooth.js`. The gallery reads camera settings from the preview's embedded EXIF metadata; keep EXIF when exporting previews. The original is loaded only for fullscreen viewing. Fields missing from an image are shown as “Not recorded in file”; GPS data is not displayed.

On macOS, make a 3000-pixel-wide preview while retaining EXIF with:

```sh
mkdir -p assets/photobooth
sips -s format jpeg -s formatOptions 88 --resampleWidth 3000 path/to/original.jpg --out assets/photobooth/photo-preview.jpg
```

## Files

- `index.html` — page content and interactions
- `styles.css` — layout, visual styling, and animation keyframes
- `photobooth.js` — photo archive, JPEG EXIF reader, and fullscreen controls
- `script.js` — retained scroll-reveal helper from the newer version; the restored page does not depend on it
