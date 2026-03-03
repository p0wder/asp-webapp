'use client';

import { useState } from 'react';

export default function QuoteForm() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    newsletter: false,
    phone: '',
    whatDoYouNeed: '',
    quantity: '',
    garmentType: '',
    dateNeeded: '',
    notes: '',
  });
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        formDataToSend.append(key, formData[key]);
      });
      if (file) {
        formDataToSend.append('file', file);
      }

      const response = await fetch('/api/submit-quote', {
        method: 'POST',
        body: formDataToSend,
      });

      if (response.ok) {
        setSubmitStatus('success');
        // Reset form
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          newsletter: false,
          phone: '',
          whatDoYouNeed: '',
          quantity: '',
          garmentType: '',
          dateNeeded: '',
          notes: '',
        });
        setFile(null);
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {/* Name Fields */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium mb-2">
            First Name <span className="text-gray-500">(required)</span>
          </label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium mb-2">
            Last Name <span className="text-gray-500">(required)</span>
          </label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2">
          Email <span className="text-gray-500">(required)</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Newsletter Checkbox */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="newsletter"
          name="newsletter"
          checked={formData.newsletter}
          onChange={handleChange}
          className="w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-black"
        />
        <label htmlFor="newsletter" className="text-sm font-medium">
          SIGN UP FOR NEWS AND UPDATES
        </label>
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-2">
          Phone
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* What do you need */}
      <div>
        <label htmlFor="whatDoYouNeed" className="block text-sm font-medium mb-2">
          What do you need? <span className="text-gray-500">(required)</span>
        </label>
        <p className="text-sm text-gray-500 mb-2">This helps us quote you faster</p>
        <select
          id="whatDoYouNeed"
          name="whatDoYouNeed"
          value={formData.whatDoYouNeed}
          onChange={handleChange}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black bg-white"
        >
          <option value="">Select an option</option>
          <option value="screen-printing">Screen Printing</option>
          <option value="embroidery">Embroidery</option>
          <option value="dtg-printing">DTG Printing</option>
          <option value="heat-transfer">Heat Transfer</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Quantity */}
      <div>
        <label htmlFor="quantity" className="block text-sm font-medium mb-2">
          Quantity <span className="text-gray-500">(required)</span>
        </label>
        <p className="text-sm text-gray-500 mb-2">How many pieces do you need? (Best Estimate)</p>
        <input
          type="number"
          id="quantity"
          name="quantity"
          value={formData.quantity}
          onChange={handleChange}
          required
          min="1"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Garment Type */}
      <div>
        <label htmlFor="garmentType" className="block text-sm font-medium mb-2">
          Garment Type <span className="text-gray-500">(required)</span>
        </label>
        <p className="text-sm text-gray-500 mb-2">(T-shirt, hoodie, hat, etc.)</p>
        <input
          type="text"
          id="garmentType"
          name="garmentType"
          value={formData.garmentType}
          onChange={handleChange}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Date Needed */}
      <div>
        <label htmlFor="dateNeeded" className="block text-sm font-medium mb-2">
          Date Needed
        </label>
        <input
          type="date"
          id="dateNeeded"
          name="dateNeeded"
          value={formData.dateNeeded}
          onChange={handleChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* Notes/Details */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-2">
          Notes / Details
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows="4"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black resize-none"
        />
      </div>

      {/* File Upload */}
      <div>
        <label htmlFor="file" className="block text-sm font-medium mb-2">
          File Upload
        </label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-black transition-colors">
          <input
            type="file"
            id="file"
            onChange={handleFileChange}
            accept="image/*,.pdf,.ai"
            className="hidden"
          />
          <label htmlFor="file" className="cursor-pointer">
            <div className="text-4xl mb-2">+</div>
            <div className="text-sm font-medium">
              {file ? file.name : 'Add a File'}
            </div>
          </label>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-black text-white py-4 rounded-full font-medium text-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
      </button>

      {/* Status Messages */}
      {submitStatus === 'success' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-center">
          Thank you! Your quote request has been submitted successfully. We'll get back to you soon.
        </div>
      )}
      {submitStatus === 'error' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-center">
          Sorry, there was an error submitting your request. Please try again or contact us directly.
        </div>
      )}
    </form>
  );
}
