import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6 md:py-20">
      {/* Hero Section */}
      <div className="flex flex-col items-center text-center space-y-8 py-6 md:py-20">
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight max-w-4xl" style={{ color: 'var(--foreground)' }}>
          Custom Apparel <span style={{ color: '#00FF66' }}>Made Simple</span>
        </h1>
        <p className="text-xl md:text-2xl max-w-2xl" style={{ color: 'var(--muted)' }}>
          Custom apparel, embroidery, online stores, and bulk orders made simple. <span style={{ fontVariant: 'small-caps' }}>Thread Giant</span> brings your brand to life.
        </p>
        <Link
          href="/quote"
          className="px-10 py-4 rounded-full text-lg font-medium transition-opacity hover:opacity-85 mt-8"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Get Your Free Quote
        </Link>
      </div>

      {/* Features Section */}
      <div className="grid md:grid-cols-3 gap-12 py-20" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="space-y-4 pl-4" style={{ borderLeft: '2px solid #00FF66' }}>
          <h3 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>Quality Printing</h3>
          <p style={{ color: 'var(--muted)' }}>
            Professional screen printing with vibrant, long-lasting results on premium garments.
          </p>
        </div>
        <div className="space-y-4 pl-4" style={{ borderLeft: '2px solid #00FF66' }}>
          <h3 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>Fast Turnaround</h3>
          <p style={{ color: 'var(--muted)' }}>
            Quick production times without compromising quality. Get your custom apparel when you need it.
          </p>
        </div>
        <div className="space-y-4 pl-4" style={{ borderLeft: '2px solid #00FF66' }}>
          <h3 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>Custom Designs</h3>
          <p style={{ color: 'var(--muted)' }}>
            Upload your artwork or work with us to create the perfect design for your project.
          </p>
        </div>
      </div>
    </div>
  );
}
