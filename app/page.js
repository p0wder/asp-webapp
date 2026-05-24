import Link from 'next/link';
import Image from 'next/image';
import { portfolioImages } from '@/lib/portfolioImages';

// ─── Static content ──────────────────────────────────────────────────────────

const STATS = [
  { value: '500+', label: 'Orders Completed' },
  { value: '10+', label: 'Years in Business' },
  { value: '2 Weeks', label: 'Standard Turnaround' },
  { value: '5-Star', label: 'Google Rated' },
];

const TESTIMONIALS = [
  {
    quote: "Once again! Thread Giant delivered an amazing product. The entire process was great. From the quote, to draft, to receiving the final product. 10/10 recommend!",
    name: "Scottie G",
    company: "Google Review",
  },
  {
    quote: "I had a rush to have a sweatshirt made to do an interview on KTIV in less than 24 hours. Not only did they get it done they exceeded my expectations and did an absolute amazing job. Definitely coming back to them for our London Marathon shirts!",
    name: "Anthony Kelly",
    company: "Google Review",
  },
  {
    quote: "My shirts turned out PERFECT. Exactly what I asked for and he was very nice and got them done really fast. I highly recommend going through him if you are in a jam of getting something made. Very great on communicating as well!",
    name: "Mckenzie Noble",
    company: "Google Review",
  },
];

const SERVICES = [
  { icon: '🖨️', name: 'Screen Printing', detail: 'Vibrant multi-color prints on any garment' },
  { icon: '🧵', name: 'Embroidery', detail: 'Premium stitched logos for hats and polos' },
  { icon: '🎨', name: 'DTF Transfer', detail: 'Full-color photographic detail, no minimums' },
  { icon: '📦', name: 'Bulk Orders', detail: 'Volume pricing for large runs and team orders' },
];

const PREVIEW_COUNT = 6;

export default function Home() {
  const previewImages = portfolioImages.slice(0, PREVIEW_COUNT);

  return (
    <div className="max-w-7xl mx-auto px-6">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center text-center space-y-8 py-16 md:py-24">
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight max-w-4xl" style={{ color: 'var(--foreground)' }}>
          Custom Apparel <span style={{ color: '#00FF66' }}>Made Simple</span>
        </h1>
        <p className="text-xl md:text-2xl max-w-2xl" style={{ color: 'var(--muted)' }}>
          Screen printing, embroidery, and DTF transfers for teams, businesses, and events.
          Family-owned. Fast turnaround. No hassle.
        </p>
        <Link
          href="/quote"
          className="px-10 py-4 rounded-full text-lg font-semibold transition-opacity hover:opacity-85"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Get Your Free Quote
        </Link>
      </div>

      {/* ── Buying signals ─────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-6 py-12"
        style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
      >
        {SERVICES.map((s) => (
          <div key={s.name} className="flex flex-col items-start gap-3 pl-4" style={{ borderLeft: '2px solid #00FF66' }}>
            <span className="text-2xl">{s.icon}</span>
            <div>
              <h3 className="font-bold text-base" style={{ color: 'var(--foreground)' }}>{s.name}</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick specs bar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-center gap-x-10 gap-y-3 py-8 text-sm" style={{ color: 'var(--muted)' }}>
        <span>✓ <strong style={{ color: 'var(--foreground)' }}>12-piece minimum</strong> on screen printing</span>
        <span>✓ <strong style={{ color: 'var(--foreground)' }}>No minimum</strong> on DTF transfers</span>
        <span>✓ Standard turnaround <strong style={{ color: 'var(--foreground)' }}>10–14 business days</strong></span>
        <span>✓ Rush orders <strong style={{ color: 'var(--foreground)' }}>available</strong> — ask us</span>
      </div>

      {/* ── Social proof ───────────────────────────────────────────────────── */}
      <div className="py-16" style={{ borderTop: '1px solid var(--border)' }}>
        <h2 className="text-3xl font-bold text-center mb-12" style={{ color: 'var(--foreground)' }}>
          Why Customers Choose <span style={{ color: '#00FF66' }}>Thread Giant</span>
        </h2>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-14 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-4xl font-bold mb-1" style={{ color: '#00FF66' }}>{s.value}</div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="rounded-xl p-6"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="text-lg mb-1" style={{ color: '#00FF66' }}>★★★★★</div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--foreground)' }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{t.name}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{t.company}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Portfolio preview ──────────────────────────────────────────────── */}
      <div className="py-16" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>Our Work</h2>
          <Link
            href="/portfolio"
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: '#00FF66' }}
          >
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {previewImages.map((img) => (
            <Link key={img.id} href="/portfolio" className="block group overflow-hidden rounded-lg">
              <div className="relative aspect-square">
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            href="/portfolio"
            className="inline-block px-8 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-85"
            style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
          >
            View All Work →
          </Link>
        </div>
      </div>

      {/* ── Bottom CTA ─────────────────────────────────────────────────────── */}
      <div className="text-center py-20" style={{ borderTop: '1px solid var(--border)' }}>
        <h2 className="text-4xl font-bold mb-4" style={{ color: 'var(--foreground)' }}>
          Ready to get started?
        </h2>
        <p className="text-lg mb-8" style={{ color: 'var(--muted)' }}>
          Fill out our quick quote form and we&apos;ll get back to you within 1 business day.
        </p>
        <Link
          href="/quote"
          className="px-10 py-4 rounded-full text-lg font-semibold transition-opacity hover:opacity-85"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Get Your Free Quote
        </Link>
      </div>

    </div>
  );
}
