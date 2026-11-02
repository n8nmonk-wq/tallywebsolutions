import * as React from "react";

type ViewTransitionProps = { name: string; share?: string; default?: string; children: React.ReactNode };
// React's ViewTransition ships with the App Router's bundled React; tests and older runtimes fall back to plain children.
const ViewTransition = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }).ViewTransition;

export const morphName = (slug: string) => `cover-${slug.replace(/[^a-z0-9-]/gi, "-")}`;

// One cover, two pages: the card cover glides into the product page cover and back.
export default function Morph({ name, children }: { name: string; children: React.ReactNode }) {
  return ViewTransition ? <ViewTransition name={name} share="morph" default="none">{children}</ViewTransition> : <>{children}</>;
}
