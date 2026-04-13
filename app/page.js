import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6 md:py-20">
      {/* Hero Section */}
      <div className="flex flex-col items-center text-center space-y-8 py-6 md:py-20">
        <h1 className="text-6xl md:text-7xl font-bold tracking-tight max-w-4xl">
          Custom Apparel Made Simple
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 max-w-2xl">
          Custom apparel, embroidery, online stores, and bulk orders made simple. Thread Giant brings your brand to life.
        </p>
        <Link 
          href="/quote" 
          className="bg-black text-white dark:bg-white dark:text-black px-10 py-4 rounded-full text-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors mt-8"
        >
          Get Your Free Quote
        </Link>
      </div>

      {/* Features Section */}
      <div className="grid md:grid-cols-3 gap-12 py-20 border-t border-black dark:border-gray-700">
        <div className="space-y-4">
          <h3 className="text-2xl font-bold">Quality Printing</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Professional screen printing with vibrant, long-lasting results on premium garments.
          </p>
        </div>
        <div className="space-y-4">
          <h3 className="text-2xl font-bold">Fast Turnaround</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Quick production times without compromising quality. Get your custom apparel when you need it.
          </p>
        </div>
        <div className="space-y-4">
          <h3 className="text-2xl font-bold">Custom Designs</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Upload your artwork or work with us to create the perfect design for your project.
          </p>
        </div>
      </div>
    </div>
  );
}
