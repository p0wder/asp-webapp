export const metadata = {
  title: 'Contact - Thread Giant',
  description: 'Get in touch with Thread Giant for custom screen printing services.',
};

export default function ContactPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4">Get In Touch</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Have questions about our services? Ready to start your custom printing project? 
          We'd love to hear from you.
        </p>
      </div>

      {/* Contact Cards */}
      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
        {/* Phone Card */}
        <a 
          href="tel:712-389-8862"
          className="border border-gray-200 p-12 hover:border-black transition-colors group text-center"
        >
          <div className="mb-6">
            <svg 
              className="w-12 h-12 mx-auto group-hover:scale-110 transition-transform" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" 
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Phone / Text</h2>
          <p className="text-xl text-gray-600 group-hover:text-black transition-colors">
            712-389-8862
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Click to call or text us
          </p>
        </a>

        {/* Email Card */}
        <a 
          href="mailto:aspmerch@gmail.com"
          className="border border-gray-200 p-12 hover:border-black transition-colors group text-center"
        >
          <div className="mb-6">
            <svg 
              className="w-12 h-12 mx-auto group-hover:scale-110 transition-transform" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.5} 
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" 
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Email</h2>
          <p className="text-xl text-gray-600 group-hover:text-black transition-colors break-all">
            aspmerch@gmail.com
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Click to send us an email
          </p>
        </a>
      </div>

      {/* Quick Quote CTA */}
      <div className="text-center border-t border-black pt-16">
        <h2 className="text-3xl font-bold mb-4">Need a Quote?</h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Fill out our quick quote form and we'll get back to you with pricing and timeline details.
        </p>
        <a 
          href="/quote" 
          className="inline-block bg-black text-white px-10 py-4 rounded-full text-lg font-medium hover:bg-gray-800 transition-colors"
        >
          Get Your Free Quote
        </a>
      </div>

      {/* Business Hours */}
      <div className="mt-16 text-center">
        <h3 className="text-xl font-bold mb-4">Business Hours</h3>
        <p className="text-gray-600">
          Monday - Friday: 9:00 AM - 5:00 PM CST
        </p>
        <p className="text-gray-600">
          Saturday - Sunday: Closed
        </p>
        <p className="text-sm text-gray-500 mt-4">
          We typically respond within 24 hours
        </p>
      </div>
    </div>
  );
}
