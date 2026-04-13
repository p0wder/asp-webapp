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

  const inputStyle = {
    background: '#1a0033',
    border: '1px solid #3B0066',
    color: '#ffffff',
  };

  const inputFocusClass = "w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2";

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {/* Name Fields */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
            First Name <span style={{ color: '#9D4EDD' }}>(required)</span>
          </label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            required
            className={inputFocusClass}
            style={{ ...inputStyle, '--tw-ring-color': '#CCFF00' }}
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
            Last Name <span style={{ color: '#9D4EDD' }}>(required)</span>
          </label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            required
            className={inputFocusClass}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          Email <span style={{ color: '#9D4EDD' }}>(required)</span>
        </label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          className={inputFocusClass}
          style={inputStyle}
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
          className="w-5 h-5 rounded focus:ring-2"
          style={{ accentColor: '#CCFF00', borderColor: '#3B0066' }}
        />
        <label htmlFor="newsletter" className="text-sm font-medium" style={{ color: '#9D4EDD' }}>
          SIGN UP FOR NEWS AND UPDATES
        </label>
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          Phone
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          className={inputFocusClass}
          style={inputStyle}
        />
      </div>

      {/* What do you need */}
      <div>
        <label htmlFor="whatDoYouNeed" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          What do you need? <span style={{ color: '#9D4EDD' }}>(required)</span>
        </label>
        <p className="text-sm mb-2" style={{ color: '#9D4EDD' }}>This helps us quote you faster</p>
        <select
          id="whatDoYouNeed"
          name="whatDoYouNeed"
          value={formData.whatDoYouNeed}
          onChange={handleChange}
          required
          className={inputFocusClass}
          style={inputStyle}
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
        <label htmlFor="quantity" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          Quantity <span style={{ color: '#9D4EDD' }}>(required)</span>
        </label>
        <p className="text-sm mb-2" style={{ color: '#9D4EDD' }}>How many pieces do you need? (Best Estimate)</p>
        <input
          type="number"
          id="quantity"
          name="quantity"
          value={formData.quantity}
          onChange={handleChange}
          required
          min="1"
          className={inputFocusClass}
          style={inputStyle}
        />
      </div>

      {/* Garment Type */}
      <div>
        <label htmlFor="garmentType" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          Garment Type <span style={{ color: '#9D4EDD' }}>(required)</span>
        </label>
        <p className="text-sm mb-2" style={{ color: '#9D4EDD' }}>(T-shirt, hoodie, hat, etc.)</p>
        <input
          type="text"
          id="garmentType"
          name="garmentType"
          value={formData.garmentType}
          onChange={handleChange}
          required
          className={inputFocusClass}
          style={inputStyle}
        />
      </div>

      {/* Date Needed */}
      <div>
        <label htmlFor="dateNeeded" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          Date Needed
        </label>
        <input
          type="date"
          id="dateNeeded"
          name="dateNeeded"
          value={formData.dateNeeded}
          onChange={handleChange}
          className={inputFocusClass}
          style={inputStyle}
        />
      </div>

      {/* Notes/Details */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          Notes / Details
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows="4"
          className={`${inputFocusClass} resize-none`}
          style={inputStyle}
        />
      </div>

      {/* File Upload */}
      <div>
        <label htmlFor="file" className="block text-sm font-medium mb-2" style={{ color: '#ffffff' }}>
          File Upload
        </label>
        <div
          className="rounded-lg p-8 text-center transition-colors"
          style={{ border: '2px dashed #3B0066' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#9D4EDD'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#3B0066'}
        >
          <input
            type="file"
            id="file"
            onChange={handleFileChange}
            accept="image/*,.pdf,.ai"
            className="hidden"
          />
          <label htmlFor="file" className="cursor-pointer">
            <div className="text-4xl mb-2" style={{ color: '#CCFF00' }}>+</div>
            <div className="text-sm font-medium" style={{ color: '#9D4EDD' }}>
              {file ? file.name : 'Add a File'}
            </div>
          </label>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 rounded-full font-medium text-lg transition-colors disabled:cursor-not-allowed"
        style={{
          background: isSubmitting ? '#555' : '#CCFF00',
          color: isSubmitting ? '#aaa' : '#0B0B0B',
        }}
      >
        {isSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
      </button>

      {/* Status Messages */}
      {submitStatus === 'success' && (
        <div className="p-4 rounded-lg text-center" style={{ background: '#0d2b0d', border: '1px solid #1a5c1a', color: '#4ade80' }}>
          Thank you! Your quote request has been submitted successfully. We'll get back to you soon.
        </div>
      )}
      {submitStatus === 'error' && (
        <div className="p-4 rounded-lg text-center" style={{ background: '#2b0d0d', border: '1px solid #5c1a1a', color: '#f87171' }}>
          Sorry, there was an error submitting your request. Please try again or contact us directly.
        </div>
      )}
    </form>
  );
}
