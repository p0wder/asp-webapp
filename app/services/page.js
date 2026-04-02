export const metadata = {
  title: 'Services - Americana Printing',
  description: 'Professional screen printing, embroidery, and custom apparel services.',
};

export default function ServicesPage() {
  const services = [
    {
      title: 'Screen Printing',
      description: 'High-quality screen printing for t-shirts, hoodies, and more. Perfect for bulk orders with vibrant, long-lasting prints.',
      features: [
        'Bulk order discounts',
        'Multiple color options',
        'Durable, long-lasting prints',
        'Fast turnaround times'
      ]
    },
    {
      title: 'Embroidery',
      description: 'Professional embroidery services for a premium, textured look. Ideal for corporate apparel, hats, and polo shirts.',
      features: [
        'Premium quality stitching',
        'Perfect for corporate wear',
        'Hats, polos, and jackets',
        'Custom logo digitization'
      ]
    },
    {
      title: 'DTG Printing',
      description: 'Direct-to-garment printing for detailed, full-color designs. Great for small batches and complex artwork.',
      features: [
        'Photo-quality prints',
        'No minimum order quantity',
        'Full-color designs',
        'Soft, breathable finish'
      ]
    },
    {
      title: 'Heat Transfer',
      description: 'Versatile heat transfer printing for specialty items and unique materials. Perfect for custom numbers and names.',
      features: [
        'Great for specialty fabrics',
        'Custom names and numbers',
        'Vibrant colors',
        'Quick production'
      ]
    },
    {
      title: 'Custom Design',
      description: 'Our design team can help bring your vision to life. From concept to final product, we\'ll work with you every step of the way.',
      features: [
        'Professional design assistance',
        'Logo creation and refinement',
        'Mockup previews',
        'Unlimited revisions'
      ]
    },
    {
      title: 'Bulk Orders',
      description: 'Special pricing for large quantity orders. Perfect for events, teams, corporate gifts, and promotional merchandise.',
      features: [
        'Volume discounts',
        'Dedicated account manager',
        'Flexible payment terms',
        'Warehousing options'
      ]
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4">Our Services</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          From screen printing to embroidery, we offer a full range of custom apparel services 
          to bring your designs to life with professional quality and attention to detail.
        </p>
      </div>

      {/* Services Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {services.map((service, index) => (
          <div 
            key={index}
            className="border border-gray-200 dark:border-gray-700 p-8 hover:border-black dark:hover:border-gray-400 transition-colors group"
          >
            <h2 className="text-2xl font-bold mb-4 group-hover:opacity-70 transition-opacity">
              {service.title}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {service.description}
            </p>
            <ul className="space-y-2">
              {service.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1">•</span>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* CTA Section */}
      <div className="mt-16 text-center border-t border-black dark:border-gray-700 pt-16">
        <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          Contact us today for a free quote on your custom printing project.
        </p>
        <a 
          href="/quote" 
          className="inline-block bg-black text-white dark:bg-white dark:text-black px-10 py-4 rounded-full text-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          Get Your Free Quote
        </a>
      </div>
    </div>
  );
}
