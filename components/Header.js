'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header style={{ borderBottom: '1px solid #3B0066', background: '#3B0066' }}>
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
            style={{ color: '#ffffff' }}
          >
            Services
          </Link>
          <Link 
            href="/portfolio" 
            className="font-medium hover:opacity-70 transition-opacity"
            style={{ color: '#ffffff' }}
          >
            Portfolio
          </Link>
          <Link 
            href="/contact" 
            className="font-medium hover:opacity-70 transition-opacity"
            style={{ color: '#ffffff' }}
          >
            Contact
          </Link>
          <Link 
            href="/quote" 
            className="px-6 py-3 rounded-full font-medium transition-colors"
            style={{ background: '#CCFF00', color: '#0B0B0B' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Get a Quote
          </Link>
          <ThemeToggle />
        </nav>

        {/* Mobile Hamburger */}
        <button
          className="sm:hidden flex flex-col justify-center items-center gap-1.5 p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 transition-transform duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} style={{ background: '#CCFF00' }} />
          <span className={`block w-6 h-0.5 transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} style={{ background: '#CCFF00' }} />
          <span className={`block w-6 h-0.5 transition-transform duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} style={{ background: '#CCFF00' }} />
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {menuOpen && (
        <nav className="sm:hidden px-6 py-4 flex flex-col gap-4" style={{ borderTop: '1px solid #9D4EDD' }}>
          <Link 
            href="/services" 
            className="font-medium hover:opacity-70 transition-opacity"
            style={{ color: '#ffffff' }}
            onClick={() => setMenuOpen(false)}
          >
            Services
          </Link>
          <Link 
            href="/portfolio" 
            className="font-medium hover:opacity-70 transition-opacity"
            style={{ color: '#ffffff' }}
            onClick={() => setMenuOpen(false)}
          >
            Portfolio
          </Link>
          <Link 
            href="/contact" 
            className="font-medium hover:opacity-70 transition-opacity"
            style={{ color: '#ffffff' }}
            onClick={() => setMenuOpen(false)}
          >
            Contact
          </Link>
          <Link 
            href="/quote" 
            className="px-6 py-3 rounded-full font-medium transition-colors text-center"
            style={{ background: '#CCFF00', color: '#0B0B0B' }}
            onClick={() => setMenuOpen(false)}
          >
            Get a Quote
          </Link>
        </nav>
      )}
    </header>
  );
}
