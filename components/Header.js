'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-black">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo + Company Name */}
        <Link href="/" className="hover:opacity-70 transition-opacity flex items-center gap-3">
          <Image
            src="/thread-giant-logo-1.png"
            alt="Thread Giant"
            width={180}
            height={60}
            priority
            className="h-12 w-auto"
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden sm:flex items-center gap-8">
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

        {/* Mobile Hamburger */}
        <button
          className="sm:hidden flex flex-col justify-center items-center gap-1.5 p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 bg-black transition-transform duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block w-6 h-0.5 bg-black transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-6 h-0.5 bg-black transition-transform duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {menuOpen && (
        <nav className="sm:hidden border-t border-black px-6 py-4 flex flex-col gap-4">
          <Link 
            href="/services" 
            className="font-medium hover:opacity-70 transition-opacity"
            onClick={() => setMenuOpen(false)}
          >
            Services
          </Link>
          <Link 
            href="/portfolio" 
            className="font-medium hover:opacity-70 transition-opacity"
            onClick={() => setMenuOpen(false)}
          >
            Portfolio
          </Link>
          <Link 
            href="/contact" 
            className="font-medium hover:opacity-70 transition-opacity"
            onClick={() => setMenuOpen(false)}
          >
            Contact
          </Link>
          <Link 
            href="/quote" 
            className="bg-black text-white px-6 py-3 rounded-full font-medium hover:bg-gray-800 transition-colors text-center"
            onClick={() => setMenuOpen(false)}
          >
            Get a Quote
          </Link>
        </nav>
      )}
    </header>
  );
}
