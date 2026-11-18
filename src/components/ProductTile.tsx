import Cover from "./Cover";

// How a product looks in the store: a software tile (landscape, rounded, like an app or a screen).
// An uploaded cover fills the tile; without one the add-on's icon is shown in an app-style chip.
export default function ProductTile({ src, title, sizes, priority }: { src: string | null; title: string; sizes: string; priority?: boolean }) {
  return <span className={`ptile${src ? " has-art" : ""}`}>
    <Cover src={src} title={title} sizes={sizes} priority={priority} />
  </span>;
}
