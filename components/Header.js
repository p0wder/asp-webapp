import Link from 'next/link';

export default function Header() {
  return (
    <header className="border-b border-black">
      <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold tracking-tight hover:opacity-70 transition-opacity">
          AMERICANA PRINTING
        </Link>
        <nav className="flex items-center gap-8">
          <Link 
            href="/services" 
            className="font-medium hover:opacity-70 transition-opacity"
          >
            Services
          </Link>
          <Link 
            href="/portfolio" 
            className="font-medium hover:opacity-70 transition-opacity"
          >
            Portfolio
          </Link>
          <Link 
            href="/contact" 
            className="font-medium hover:opacity-70 transition-opacity"
          >
            Contact
          </Link>
          <Link 
            href="/quote" 
            className="bg-black text-white px-6 py-3 rounded-full font-medium hover:bg-gray-800 transition-colors"
          >
            Get a Quote
          </Link>
        </nav>
      </div>
    </header>
  );
}
