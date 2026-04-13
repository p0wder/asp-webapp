import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6 md:py-20">
      {/* Hero Section */}
      <div className="flex flex-col items-center text-center space-y-8 py-6 md:py-20">
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight max-w-4xl" style={{ color: '#ffffff' }}>
          Custom Apparel Made Simple
        </h1>
        <p className="text-xl md:text-2xl max-w-2xl" style={{ color: '#9D4EDD' }}>
          Custom apparel, embroidery, online stores, and bulk orders made simple. Thread Giant brings your brand to life.
        </p>
        <Link 
          href="/quote" 
          className="px-10 py-4 rounded-full text-lg font-medium transition-colors mt-8"
          style={{ background: '#CCFF00', color: '#0B0B0B' }}
        >
          Get Your Free Quote
        </Link>
      </div>

      {/* Features Section */}
      <div className="grid md:grid-cols-3 gap-12 py-20" style={{ borderTop: '1px solid #3B0066' }}>
        <div className="space-y-4">
          <h3 className="text-2xl font-bold" style={{ color: '#CCFF00' }}>Quality Printing</h3>
          <p style={{ color: '#9D4EDD' }}>
            Professional screen printing with vibrant, long-lasting results on premium garments.
          </p>
        </div>
        <div className="space-y-4">
          <h3 className="text-2xl font-bold" style={{ color: '#CCFF00' }}>Fast Turnaround</h3>
          <p style={{ color: '#9D4EDD' }}>
            Quick production times without compromising quality. Get your custom apparel when you need it.
          </p>
        </div>
        <div className="space-y-4">
          <h3 className="text-2xl font-bold" style={{ color: '#CCFF00' }}>Custom Designs</h3>
          <p style={{ color: '#9D4EDD' }}>
            Upload your artwork or work with us to create the perfect design for your project.
          </p>
        </div>
      </div>
    </div>
  );
}
