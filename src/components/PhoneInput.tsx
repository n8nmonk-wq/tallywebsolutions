'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type PhoneCountry = { code: string; name: string; dial: string };

// Regional-indicator letters turn an ISO country code into its flag.
const flag = (code: string) => code.toUpperCase().replace(/[A-Z]/g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));

// Country code picker with search, plus the mobile number field. Choosing a country sets the dial code.
export default function PhoneInput({ countries, country, onCountry, disabled }: {
  countries: PhoneCountry[]; country: string; onCountry: (code: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = countries.find((c) => c.code === country) ?? countries[0];

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/^\+/, '');
    return countries.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q
      || (digits && c.dial.slice(1).startsWith(digits)));
  }, [countries, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function choose(code: string) {
    onCountry(code);
    setOpen(false);
    setQuery('');
  }

  return <div ref={root} className="relative">
    <div className="flex gap-2">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="field-input flex min-h-[48px] w-auto shrink-0 items-center gap-2 px-3">
        <span aria-hidden="true" className="text-xl leading-none">{flag(selected.code)}</span>
        <span className="whitespace-nowrap">{selected.dial}</span>
        <span aria-hidden="true" className="text-ink-soft">▾</span>
        <span className="sr-only">{selected.name}</span>
      </button>
      <input id="phone" name="phone" type="tel" inputMode="tel" required maxLength={20} autoComplete="tel-national"
        placeholder="Mobile number" disabled={disabled} className="field-input min-w-0 flex-1" />
    </div>

    {open && <div id={listId} className="absolute left-0 right-0 top-full z-50 mt-2 max-w-[24rem] rounded-xl border border-line bg-bg p-2 sm:right-auto sm:w-[22rem]"
      style={{ boxShadow: 'var(--shadow-e4)' }}>
      <input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Search country or code" aria-label="Search countries" className="field-input min-h-[44px]" />
      <ul role="listbox" aria-label="Countries" className="mt-2 max-h-64 overflow-y-auto">
        {matches.length === 0 && <li className="px-3 py-3 text-sm text-ink-soft">No country matches.</li>}
        {matches.map((c) => <li key={c.code} role="option" aria-selected={c.code === country}>
          <button type="button" onClick={() => choose(c.code)}
            className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] hover:bg-bg-2 ${c.code === country ? 'bg-bg-2 font-medium' : ''}`}>
            <span aria-hidden="true" className="text-lg leading-none">{flag(c.code)}</span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="shrink-0 text-ink-soft">{c.dial}</span>
          </button>
        </li>)}
      </ul>
    </div>}
  </div>;
}
