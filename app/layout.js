import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/context/ThemeContext";
import { CartProvider } from "@/context/CartContext";

export const metadata = {
  title: "Thread Giant - Custom Screen Printing",
  description: "Professional custom screen printing services for t-shirts, hoodies, and more.",
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
  );
}
