export const metadata = {
  title: 'Services - Thread Giant',
  description: 'From businesses and schools to sports teams, events, and merch stores, Thread Giant provides premium custom apparel solutions with fast turnaround and unmatched service.',
};

export default function ServicesPage() {
  const services = [
    {
      title: 'Screen Printing',
      icon: '🗜️',
      description: 'Premium screen printing for t-shirts, hoodies, uniforms, and promotional apparel. Ideal for businesses, schools, teams, and large-volume orders.',
      features: [
        'Bulk order discounts',
        'Multiple color options',
        'Durable, long-lasting prints',
        'Fast turnaround times'
      ]
    },
    {
      title: 'Embroidery',
      icon: '🧵',
      description: 'Professional embroidery for hats, polos, jackets, and corporate apparel with crisp, premium stitching built to last.',
      features: [
        'Premium quality stitching',
        'Perfect for corporate wear',
        'Hats, polos, and jackets',
        'Custom logo digitization'
      ]
    },
    {
      title: 'Bulk Orders',
      icon: '📦',
      description: 'Special pricing for large orders, team apparel, school spirit wear, business uniforms, and event merchandise with dedicated project support.',
      features: [
        'Volume discounts',
        'Dedicated project support',
        'Flexible payment terms',
        'Warehousing options'
      ]
    },
    {
      title: 'Online Stores & Fundraisers',
      icon: '🛍️',
      description: 'Launch branded online apparel stores for schools, teams, businesses, and events. Perfect for spirit wear, employee apparel, and limited merch drops.',
      features: [
        'Custom branded storefronts',
        'School & team spirit wear',
        'Employee & event merch',
        'Fundraiser-ready setup'
      ]
    },
    {
      title: 'DTF Printing',
      icon: '🎨',
      description: 'Direct-to-film printing for detailed, full-color designs. Great for small batches, complex artwork, and specialty garments.',
      features: [
        'Photo-quality prints',
        'No minimum order quantity',
        'Full-color designs',
        'Works on virtually any fabric'
      ]
    },
    {
      title: 'Custom Design',
      icon: '✏️',
      description: "Our design team can help bring your vision to life. From concept to final product, we'll work with you every step of the way.",
      features: [
        'Professional design assistance',
        'Logo creation and refinement',
        'Mockup previews',
        'Unlimited revisions'
      ]
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
      {/* Header */}
      <div className="text-center mb-14 md:mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-5" style={{ color: 'var(--foreground)' }}>Our Services</h1>
        <p className="text-lg md:text-xl max-w-3xl mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
          From businesses and schools to sports teams, events, and merch stores, we provide premium custom apparel solutions with fast turnaround and unmatched service.
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {services.map((service, index) => (
          <div
            key={index}
            className="p-8 rounded-sm flex flex-col transition-colors"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{service.icon}</span>
              <h2 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--accent)' }}>
                {service.title}
              </h2>
            </div>
            <p className="mb-6 leading-relaxed flex-grow" style={{ color: 'var(--muted)' }}>
              {service.description}
            </p>
            <ul className="space-y-2 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              {service.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-0.5 font-bold text-xs" style={{ color: 'var(--accent-alt)' }}>✓</span>
                  <span className="text-sm" style={{ color: 'var(--foreground)' }}>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* CTA Section */}
      <div className="mt-16 md:mt-20 text-center px-8 py-14 md:py-16 rounded-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: 'var(--foreground)' }}>Ready to bring your brand to life?</h2>
        <p className="text-lg md:text-xl mb-8 max-w-2xl mx-auto" style={{ color: 'var(--muted)' }}>
          Get a fast, free quote for your next custom apparel project.
        </p>
        <a
          href="/quote"
          className="inline-block px-10 py-4 rounded-full text-lg font-medium hover:opacity-85 transition-opacity"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Get Your Free Quote
        </a>
      </div>
    </div>
  );
}
