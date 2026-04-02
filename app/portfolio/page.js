import Image from 'next/image';
import { portfolioImages } from '@/lib/portfolioImages';

export const metadata = {
  title: 'Portfolio - Americana Printing',
  description: 'View our portfolio of custom screen printing work and designs.',
};

export default function PortfolioPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4">Our Work</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Explore our portfolio of custom screen printing projects
        </p>
      </div>

      {/* Masonry Grid */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
        {portfolioImages.map((image) => (
          <div 
            key={image.id} 
            className="break-inside-avoid group cursor-pointer"
          >
            <div className="relative overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-black dark:hover:border-gray-400 transition-colors">
              <Image
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
