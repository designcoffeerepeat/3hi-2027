import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// One Markdown file per page. All copy lives in the frontmatter so it can be
// edited without touching any component.
const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
});

// Copy shared by every page: header, full screen menu and footer.
const site = defineCollection({
  loader: glob({ pattern: 'site.md', base: './src/content' }),
});

export const collections = { pages, site };
