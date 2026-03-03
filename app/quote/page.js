import QuoteForm from '@/components/QuoteForm';

export const metadata = {
  title: 'Get a Quote - Americana Printing',
  description: 'Request a custom quote for your screen printing project.',
};

export default function QuotePage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4">Get Your Free Quote</h1>
        <p className="text-xl text-gray-600">
          Fill out the form below and we'll get back to you with a custom quote for your project.
        </p>
      </div>
      <QuoteForm />
    </div>
  );
}
