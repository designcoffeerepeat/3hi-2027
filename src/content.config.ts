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

// One file per case study (/work/[slug]) and per service (/services/[slug]).
const work = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/work' }),
});

const services = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/services' }),
});

// Blog articles (/blog/[slug]). The article itself is the Markdown body.
const posts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/posts' }),
});

export const collections = { pages, site, work, services, posts };
