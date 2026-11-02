import Link from "next/link";
import { LANGUAGE_NATIVE } from "@/lib/languages";

export default function LanguageStrip({ languages }: { languages: { name: string; count: number }[] }) {
  if (languages.length < 2) return null;
  return <section className="wrap section"><div className="section-head reveal"><h2>Read in your language</h2></div>
    <ul className="lang-row">{languages.map((l) => <li key={l.name} className="reveal"><Link className="lang-chip surface surface-hover" href={`/search?language=${encodeURIComponent(l.name)}`}>
      <span className="lang-native">{LANGUAGE_NATIVE[l.name] ?? l.name}</span><span className="eyebrow">{l.name} · {l.count}</span></Link></li>)}</ul></section>;
}
