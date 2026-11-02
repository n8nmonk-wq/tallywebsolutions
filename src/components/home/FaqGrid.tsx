const FAQ: [string, string][] = [
  ["How do I get my book?", "Download it right after payment, from your order page or library."],
  ["Do I need an account?", "No. Check out with your email; sign in later to see your library."],
  ["What format are the books?", "Digital editions, usually PDF, licensed for your personal use."],
  ["Can I buy several titles?", "Yes. Add them to your bag and pay once."],
  ["Can I get a refund?", "If a file won't open or isn't as described, we replace or refund it."],
  ["Can I publish here?", "Yes. Submit your book for editorial review from Publish with us."],
];

export default function FaqGrid() {
  return <section id="faq" className="wrap section"><div className="section-head reveal"><h2>Good to know</h2></div>
    <div className="faq-grid">{FAQ.map(([q, a]) => <details key={q} className="faq-item surface reveal"><summary>{q}</summary><p>{a}</p></details>)}</div></section>;
}
