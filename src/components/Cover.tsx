import Image from "next/image";
import ProductCover from "./ProductCover";

export default function Cover({ src, title, sizes, priority, className }: { src: string | null; title: string; sizes: string; priority?: boolean; className?: string }) {
  if (!src) return <ProductCover title={title} className={className} />;
  return <Image src={src} alt={`Cover of ${title}`} width={600} height={900} sizes={sizes} preload={priority}
    unoptimized={src.startsWith("data:") || src.startsWith("https://")} className={className} />;
}
