import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/context/ThemeContext";
import { CartProvider } from "@/context/CartContext";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || "https://threadgiant.com"),
  title: "Thread Giant - Custom Screen Printing",
  description: "Professional custom screen printing services for t-shirts, hoodies, and more.",
  openGraph: {
    title: "Thread Giant - Custom Screen Printing",
    description: "Professional custom screen printing services for t-shirts, hoodies, and more.",
    images: [{ url: "/thread-giant-logo-1.png", width: 1200, height: 630, alt: "Thread Giant" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Thread Giant - Custom Screen Printing",
    description: "Professional custom screen printing services for t-shirts, hoodies, and more.",
    images: ["/thread-giant-logo-1.png"],
  },
};

// Inline script to apply the saved theme before first paint, preventing flash
const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <ClerkProvider signInUrl="/login" signUpUrl="/login" afterSignInUrl="/dashboard" afterSignUpUrl="/dashboard">
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex flex-col min-h-screen transition-colors duration-300" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <ThemeProvider>
          <CartProvider>
            <Header />
            <main className="flex-grow">
              {children}
            </main>
            <Footer />
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
    </ClerkProvider>
  );
}
