# Americana Printing - Custom Screen Printing Website

A modern, minimalist black and white website for Americana Printing's custom screen printing services. Built with Next.js and Tailwind CSS.

## Features

- 🎨 **Elegant Black & White Design** - Clean, professional minimalist aesthetic
- 📝 **Quote Request Form** - Comprehensive form with all necessary fields for custom orders
- 📁 **File Upload** - Customers can upload design files directly
- 📱 **Fully Responsive** - Works perfectly on desktop, tablet, and mobile
- ⚡ **Fast & Modern** - Built with Next.js 14 for optimal performance
- 🚀 **Vercel Ready** - Optimized for deployment on Vercel

## Getting Started

### Prerequisites

- Node.js 18+ (installed via NVM)
- npm or yarn

### Installation

1. Clone the repository or navigate to the project directory:
```bash
cd /Users/scottie/repos/asp-webapp
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
asp-webapp/
├── app/
│   ├── api/
│   │   └── submit-quote/
│   │       └── route.js          # API endpoint for form submissions
│   ├── quote/
│   │   └── page.js                # Quote request page
│   ├── globals.css                # Global styles
│   ├── layout.js                  # Root layout with header/footer
│   └── page.js                    # Home page
├── components/
│   ├── Header.js                  # Navigation header
│   ├── Footer.js                  # Footer with social links
│   └── QuoteForm.js               # Quote request form component
└── public/                        # Static assets
```

## Form Fields

The quote form includes:
- First Name (required)
- Last Name (required)
- Email (required)
- Newsletter opt-in checkbox
- Phone (optional)
- What do you need? (required dropdown)
- Quantity (required)
- Garment Type (required)
- Date Needed (optional)
- Notes/Details (optional)
- File Upload (optional)

## Email Integration

The form currently logs submissions to the console. To enable email notifications:

1. Install an email service package (e.g., Resend):
```bash
npm install resend
```

2. Add your API key to `.env.local`:
```
RESEND_API_KEY=your_api_key_here
```

3. Uncomment and configure the email code in `app/api/submit-quote/route.js`

## Deployment to Vercel

1. Push your code to GitHub

2. Go to [vercel.com](https://vercel.com) and sign in

3. Click "New Project" and import your repository

4. Vercel will auto-detect Next.js and configure everything

5. Add environment variables if using email service

6. Click "Deploy"

Your site will be live in minutes!

## Customization

### Colors
The site uses a black and white color scheme. To modify:
- Edit `app/globals.css` for global color variables
- Tailwind classes in components use `black`, `white`, and `gray-*` variants

### Content
- Update company name in `components/Header.js`
- Modify hero text in `app/page.js`
- Change social media links in `components/Footer.js`

### Form Options
Edit the dropdown options in `components/QuoteForm.js` under the "What do you need?" field

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Language**: JavaScript
- **Deployment**: Vercel

## License

© 2026 Americana Printing. All rights reserved.
