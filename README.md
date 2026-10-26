# 3h-i.com 2027

Astro site for 3 Horizons Interactive, built from the "Website 3h-i 2027 v1.0" Figma file.

## Editing copy

All copy lives in Markdown frontmatter, one file per page:

- `src/content/pages/home.md` is the homepage.
- `src/content/site.md` is shared by every page: header, full screen menu and footer.

Edit the text between the quotes and keep the indentation. New pages get their own file in `src/content/pages/`.

Images are in `public/images/` (WebP). Swap a file or point the path in the Markdown at a new one.

## Running locally

Needs Node 22.23.4 or newer (see `.nvmrc`).

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static site in dist/
```

## Deploying on Cloudflare Pages

In Cloudflare: Workers & Pages > Create > Pages > Connect to Git > pick `3hi-2027`, then:

- Framework preset: Astro
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION` = `24`

Every push to `main` deploys to production; other branches get preview URLs.

## How the motion works

- `src/scripts/three/story.ts`: the hero 'xt - 1' clock (the yellow arm ticks like a second hand), the blurred hero sun that breathes and drifts, and the scroll transition into the Shopify spotlight from the Mood page storyboard.
- `src/scripts/three/axis.ts`: the AI scan section's 3D x, y, z gizmo. Drag to spin; it drifts and settles back into the logo pose when left alone.
- `src/scripts/main.ts`: smooth scroll (Lenis), parallax (`data-speed`, `data-speed-x`), reveals (`data-reveal`), menu, header and marquee.

Everything respects `prefers-reduced-motion`, and falls back to static SVG art without WebGL.
