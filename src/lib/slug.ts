// Web addresses for products, made from their names. Client-safe: the Add product form uses it as you type.
export const SLUG_MAX = 101;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name: string): string {
  return name
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // é -> e
    .toLowerCase()
    .replace(/&/g, " and ").replace(/₹/g, " rs ").replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}
