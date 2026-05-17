'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { totals } from '@/lib/cart';

export default function CartIndicator() {
  const { cart } = useCart();
  const { itemCount } = totals(cart);

  return (
    <Link
      href="/orders/cart"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      style={{ color: 'var(--foreground)' }}
      aria-label={`Cart (${itemCount} items)`}
      title={`Cart (${itemCount} items)`}
    >
      <span aria-hidden="true" className="text-lg leading-none">🛒</span>
      {itemCount > 0 && (
        <span
          className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </Link>
  );
}
