export type NavCategory = { slug: string; name: string; children: { slug: string; name: string }[] };
type Row = { slug: string; name: string; parent_slug: string | null; sort: number };

export function buildNav(categories: Row[], top = 7) {
  const order = (a: Row, b: Row) => a.sort - b.sort || a.name.localeCompare(b.name);
  const roots = categories.filter((c) => !c.parent_slug).sort(order).map((root) => ({ slug: root.slug, name: root.name,
    children: categories.filter((c) => c.parent_slug === root.slug).sort(order).map(({ slug, name }) => ({ slug, name })) }));
  return { primary: roots.slice(0, top), more: roots.slice(top) };
}
