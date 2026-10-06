# Data license

## Plonk It content — CC BY-NC-SA 4.0

The bollard images and texts in this repository come from the
[Plonk It Guide to GeoGuessr](https://www.plonkit.net/guide), © 2021-2026 Plonk It,
licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/).

Changes made:

- Images were cropped (mostly to remove the region maps that would reveal the answer),
  resized and converted to WebP.
- Texts were translated into Japanese and summarized.
- Items were grouped into quiz questions, with the countries that use each bollard.

These adapted materials are licensed under the same CC BY-NC-SA 4.0 license.
This is an unofficial fan-made tool and is not affiliated with Plonk It.

Files covered:

- `data/raw-bollards.json` (texts extracted from Plonk It)
- `data/curation.json` (Japanese translations and answer data)
- `public/data/bollards.json` (generated from the two files above)
- `public/bollards/*.webp` (cropped images)

## Map — public domain

`public/data/world.geojson` is derived from [Natural Earth](https://www.naturalearthdata.com/)
1:10m Admin 0 countries, which is in the public domain.
