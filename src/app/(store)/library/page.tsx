import { redirect } from 'next/navigation';
import { getReader } from '@/lib/reader-auth';
import { sql, type Order } from '@/lib/db';
import { rupees } from '@/lib/money';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your library', robots: { index: false, follow: false } };
export default async function Library() {
  const reader = await getReader();
  if (!reader) redirect('/login?next=/library');
  const orders = await sql`select * from orders where lower(email) = ${reader.email.toLowerCase()} order by created_at desc limit 100` as Order[];
  return <section className="wrap py-14"><p className="eyebrow mb-4">Your library</p>
    <h1 className="title title-lg mb-4">Welcome back.</h1><p className="text-ink-soft mb-8">{reader.email}</p>
    {orders.length ? <ul className="grid gap-5">{orders.map(order => <li key={order.id} className="card flex flex-wrap justify-between gap-5">
      <div><h2 className="font-semibold">{order.items.map(item => item.title).join(' / ')}</h2>
        <p className="text-sm text-ink-soft mt-2">{new Date(order.created_at).toLocaleDateString('en-IN')} / {order.status.replaceAll('_', ' ')} / {rupees(order.total)}</p></div>
      <a className="btn btn-ghost" href={`/order/${order.id}`}>View receipt and downloads</a></li>)}</ul>
      : <div className="py-12"><p className="mb-6">Your purchases will appear here.</p><a className="btn btn-primary" href="/search">Browse books</a></div>}
    <form action="/api/reader/sign-out" method="post" className="mt-8"><button className="btn btn-ghost">Sign out</button></form>
  </section>;
}
