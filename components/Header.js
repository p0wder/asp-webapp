import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default function Header() {
  return (
    <header className="border-b border-black dark:border-gray-700">
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
            className="bg-black text-white dark:bg-white dark:text-black px-6 py-3 rounded-full font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            Get a Quote
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
