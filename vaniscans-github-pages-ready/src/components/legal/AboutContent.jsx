import React from 'react';


export const metadata = {
    title: 'About Us - VaniScans',
    description: 'Learn more about VaniScans (vaniscans.online), a high-performance fan-operated manhwa, manga, and webtoon reading hub.',
};

function LegalHeader() {
    return (
        <header className="sticky top-0 z-40 bg-[#0c0d14]/90 backdrop-blur-md border-b border-[#1f2337]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <a href="/" className="flex items-center gap-2.5 group">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-700 via-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-600/30">
                        <span className="text-white font-black text-base">⚡</span>
                    </div>
                    <span className="text-lg font-black tracking-wider text-white">
                        VANI<span className="text-purple-500">SCANS</span>
                    </span>
                </a>
                <a href="/" className="px-3.5 py-1.5 rounded-xl bg-[#16192b] hover:bg-purple-600/20 text-xs font-bold text-slate-300 hover:text-white border border-[#242842] transition">
                    ← Back to Home
                </a>
            </div>
        </header>
    );
}

function LegalFooter() {
    return (
        <footer className="bg-[#0a0b10] border-t border-[#1a1c2b] py-10 mt-auto text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">⚡</div>
                        <div>
                            <div className="font-black text-slate-300 text-sm">VANISCANS</div>
                            <div>High performance manhwa & webtoon reading hub.</div>
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-6 text-slate-300 font-medium">
                        <a href="/about" className="hover:text-purple-400 transition">About Us</a>
                        <a href="/privacy" className="hover:text-purple-400 transition">Privacy Policy</a>
                        <a href="/terms" className="hover:text-purple-400 transition">Terms of Service</a>
                        <a href="/dmca" className="hover:text-purple-400 transition">DMCA</a>
                        <a href="/contact" className="hover:text-purple-400 transition">Contact Us</a>
                    </div>
                    <div>&copy; 2026 VaniScans. All rights reserved.</div>
                </div>
            </div>
        </footer>
    );
}

export default function AboutPage() {
    return (
        <div className="min-h-screen flex flex-col bg-[#0b0c13] text-slate-100">
            <LegalHeader />
            <main className="flex-grow max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="bg-[#121422] border border-[#20243b] rounded-3xl p-6 sm:p-10 space-y-6 shadow-2xl">
                    <div className="border-b border-[#1f2337] pb-5">
                        <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-600/20 text-purple-300 border border-purple-500/30">
                            Community & Platform
                        </span>
                        <h1 className="text-2xl sm:text-4xl font-black text-white mt-3">About Us</h1>
                    </div>

                    <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">Welcome to VaniScans</h2>
                            <p>
                                <strong>VaniScans (vaniscans.online)</strong> is a fan-operated manga, manhwa, and webtoon reading platform built by passionate readers for the global comic community. Our mission is to provide a fast, distraction-free, and mobile-friendly reading experience across all devices.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">What We Offer</h2>
                            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
                                <li><strong>High-Performance Reader:</strong> Seamless vertical Webtoon scroll and single-page reading modes tailored for both mobile and desktop screens.</li>
                                <li><strong>Personal Bookmarks:</strong> Save and track your favorite ongoing and completed series right from your browser without mandatory sign-ups.</li>
                                <li><strong>Community Discussions:</strong> Share your thoughts and theories with fellow readers in our chapter comment sections.</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">Support Official Creators</h2>
                            <p>
                                VaniScans is an independent fan index and reading hub. We strongly encourage all readers to support the original authors, artists, and studios by purchasing official chapters, physical volumes, and merchandise whenever available in your region.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">Get in Touch</h2>
                            <p>
                                Have feedback, questions, or copyright inquiries? Reach out to our team anytime at <a href="mailto:vaniscans@gmail.com" className="text-purple-400 underline font-semibold">vaniscans@gmail.com</a>.
                            </p>
                        </section>
                    </div>
                </div>
            </main>
            <LegalFooter />
        </div>
    );
}
