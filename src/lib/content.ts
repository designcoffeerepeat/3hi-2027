import { getCollection } from 'astro:content';

// Case studies in the order set by each file's "order" field.
export async function getCases() {
  const all = await getCollection('work');
  return all.sort((a, b) => (a.data as any).order - (b.data as any).order);
}

// Services in menu order (01 to 06).
export async function getServices() {
  const all = await getCollection('services');
  return all.sort((a, b) => String((a.data as any).number).localeCompare(String((b.data as any).number)));
}

// Blog posts, newest first.
export async function getPosts() {
  const all = await getCollection('posts');
  return all.sort((a, b) => String((b.data as any).date).localeCompare(String((a.data as any).date)));
}

// Card data for the case study grid, shared by the home page, the Work page
// and the related work on service pages.
export function caseCard(entry: any) {
  const d = entry.data;
  return {
    slug: entry.id,
    href: `/work/${entry.id}`,
    client: d.client,
    tags: d.tags ?? [],
    ...d.card,
  };
}
