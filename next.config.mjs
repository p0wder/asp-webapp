/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/orders',          destination: '/purchasing',          permanent: true },
      { source: '/orders/cart',     destination: '/purchasing/cart',     permanent: true },
      { source: '/orders/checkout', destination: '/purchasing/checkout', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.squarespace-cdn.com',
        pathname: '/content/**',
      },
    ],
  },
};

export default nextConfig;
