import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ThemeProvider } from "@/context/ThemeContext";

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
    } else if (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches) {
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
          <Header />
          <main className="flex-grow">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
