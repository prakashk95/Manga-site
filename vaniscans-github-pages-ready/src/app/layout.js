import './globals.css';

export const metadata = {
    title: 'VaniScans - Read Manga & Manhwa Online',
    description: 'Read high quality manga, manhwa and manhua online for free.',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className="bg-dark-900 text-white min-h-screen antialiased">
                {children}
            </body>
        </html>
    );
}