const FAQ: [string, string][] = [
  ["How do I get my add-on?", "Download it right after payment, from your order page or library."],
  ["Do I need an account?", "No. Check out with your email; sign in later to see your library."],
  ["What do I receive?", "TallyPrime TDL source code or TCP files, licensed for your own use. Each page states the version it supports."],
  ["Can I buy several add-ons?", "Yes. Add them to your bag and pay once."],
  ["Can I get a refund?", "If a file won't open or doesn't work with the stated TallyPrime version, we replace or refund it."],
  ["Can I sell my add-on here?", "Yes. Submit your add-on for review from the developer page."],
];

export default function FaqGrid() {
  return <section id="faq" className="wrap section"><div className="section-head reveal"><h2>Good to know</h2></div>
    <div className="faq-grid">{FAQ.map(([q, a]) => <details key={q} className="faq-item surface reveal"><summary>{q}</summary><p>{a}</p></details>)}</div></section>;
}
