import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
export default function NotFound() {
  return <div className="wrap section"><h1 className="title title-lg">This page is not on our shelf.</h1>
    <p className="my-6">The publication may have been archived or the address may have changed.</p>
    <Link className="btn btn-primary" href="/search"><ArrowLeft size={18} aria-hidden />Browse all books</Link></div>;
}
