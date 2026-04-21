// Produces a kebab-case slug used as a stable identifier for columns.
// Slugs never change once assigned, so that submissions pointing at a
// column don't get orphaned when the admin renames it.
export function slugify(name) {
    return String(name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}
