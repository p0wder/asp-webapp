'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import CartIndicator from '@/components/CartIndicator';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="hover:opacity-75 transition-opacity flex items-center gap-3">
          <Image
            src="/thread-giant-logo-1.png"
            alt="Thread Giant"
            width={180}
            height={60}
            priority
            className="h-12 w-auto dark:invert"
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden sm:flex items-center gap-8">
          <Link
            href="/purchasing"
            className="font-medium nav-link-green transition-colors"
            style={{ color: 'var(--foreground)' }}
          >
            Orders
          </Link>
          <Link
            href="/pipeline"
            className="font-medium nav-link-green transition-colors"
            style={{ color: 'var(--foreground)' }}
          >
            Quotes
          </Link>
          <Link
            href="/services"
            className="font-medium nav-link-green transition-colors"
            style={{ color: 'var(--foreground)' }}
          >
            Services
          </Link>
          <Link
            href="/portfolio"
            className="font-medium nav-link-green transition-colors"
            style={{ color: 'var(--foreground)' }}
          >
            Portfolio
          </Link>
          <Link
            href="/contact"
            className="font-medium nav-link-green transition-colors"
            style={{ color: 'var(--foreground)' }}
          >
            Contact
          </Link>
          <Link
            href="/quote"
            className="px-6 py-3 rounded-full font-medium transition-opacity hover:opacity-85"
            style={{ background: 'var(--accent)', color: '#ffffff' }}
          >
            Get a Quote
          </Link>
          <CartIndicator />
          <ThemeToggle />
        </nav>

        {/* Mobile Hamburger */}
        <button
          className="sm:hidden flex flex-col justify-center items-center gap-1.5 p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 transition-transform duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} style={{ background: 'var(--foreground)' }} />
          <span className={`block w-6 h-0.5 transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} style={{ background: 'var(--foreground)' }} />
          <span className={`block w-6 h-0.5 transition-transform duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} style={{ background: 'var(--foreground)' }} />
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {menuOpen && (
        <nav className="sm:hidden px-6 py-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <Link
            href="/purchasing"
            className="font-medium hover:opacity-75 transition-opacity"
            style={{ color: 'var(--foreground)' }}
            onClick={() => setMenuOpen(false)}
          >
            Orders
          </Link>
          <Link
            href="/pipeline"
            className="font-medium hover:opacity-75 transition-opacity"
            style={{ color: 'var(--foreground)' }}
            onClick={() => setMenuOpen(false)}
          >
            Quotes
          </Link>
          <Link
            href="/services"
            className="font-medium hover:opacity-75 transition-opacity"
            style={{ color: 'var(--foreground)' }}
            onClick={() => setMenuOpen(false)}
          >
            Services
          </Link>
          <Link
            href="/portfolio"
            className="font-medium hover:opacity-75 transition-opacity"
            style={{ color: 'var(--foreground)' }}
            onClick={() => setMenuOpen(false)}
          >
            Portfolio
          </Link>
          <Link
            href="/contact"
            className="font-medium hover:opacity-75 transition-opacity"
            style={{ color: 'var(--foreground)' }}
            onClick={() => setMenuOpen(false)}
          >
            Contact
          </Link>
          <Link
            href="/quote"
            className="px-6 py-3 rounded-full font-medium transition-opacity hover:opacity-85 text-center"
            style={{ background: 'var(--accent)', color: '#ffffff' }}
            onClick={() => setMenuOpen(false)}
          >
            Get a Quote
          </Link>
          <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="font-medium" style={{ color: 'var(--foreground)' }}>Theme</span>
            <ThemeToggle />
          </div>
        </nav>
      )}
    </header>
  );
}
