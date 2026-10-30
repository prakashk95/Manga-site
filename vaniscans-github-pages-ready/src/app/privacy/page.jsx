import React from 'react';
import Link from 'next/link';

export const metadata = {
    title: 'Privacy Policy - VaniScans',
    description: 'Privacy Policy and data practices for VaniScans (vaniscans.online).',
};

function LegalHeader() {
    return (
        <header className="sticky top-0 z-40 bg-[#0c0d14]/90 backdrop-blur-md border-b border-[#1f2337]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5 group">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-700 via-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-600/30">
                        <span className="text-white font-black text-base">⚡</span>
                    </div>
                    <span className="text-lg font-black tracking-wider text-white">
                        VANI<span className="text-purple-500">SCANS</span>
                    </span>
                </Link>
                <Link href="/" className="px-3.5 py-1.5 rounded-xl bg-[#16192b] hover:bg-purple-600/20 text-xs font-bold text-slate-300 hover:text-white border border-[#242842] transition">
                    ← Back to Home
                </Link>
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
                        <Link href="/about" className="hover:text-purple-400 transition">About Us</Link>
                        <Link href="/privacy" className="hover:text-purple-400 transition">Privacy Policy</Link>
                        <Link href="/terms" className="hover:text-purple-400 transition">Terms of Service</Link>
                        <Link href="/dmca" className="hover:text-purple-400 transition">DMCA</Link>
                        <Link href="/contact" className="hover:text-purple-400 transition">Contact Us</Link>
                    </div>
                    <div>&copy; 2026 VaniScans. All rights reserved.</div>
                </div>
            </div>
        </footer>
    );
}

export default function PrivacyPage() {
    return (
        <div className="min-h-screen flex flex-col bg-[#0b0c13] text-slate-100">
            <LegalHeader />
            <main className="flex-grow max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="bg-[#121422] border border-[#20243b] rounded-3xl p-6 sm:p-10 space-y-6 shadow-2xl">
                    <div className="border-b border-[#1f2337] pb-5">
                        <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-600/20 text-purple-300 border border-purple-500/30">
                            Data & Privacy
                        </span>
                        <h1 className="text-2xl sm:text-4xl font-black text-white mt-3">Privacy Policy</h1>
                    </div>

                    <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">1. Overview</h2>
                            <p>
                                At <strong>vaniscans.online</strong> (&quot;VaniScans&quot;), we respect your privacy and are committed to protecting any information collected while you browse our platform. You can read manga and bookmark series without registering an account.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">2. Local Storage & Cookies</h2>
                            <p>
                                We use your browser&apos;s local storage (`localStorage` and `IndexedDB`) to store your saved manga bookmarks, reading mode preferences, and optional reader nickname directly on your device so your preferences persist between visits.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">3. Analytics & Traffic Measurement</h2>
                            <p>
                                We may use standard analytics tools such as Google Analytics to understand aggregate traffic trends, popular chapters, and device types. These tools collect anonymized usage data such as pages visited, browser type, and approximate region.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">4. Third-Party Links & Advertisements</h2>
                            <p>
                                Our website may display sponsored banners or links to external websites. We are not responsible for the privacy practices or content of third-party websites.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">5. Contact Information</h2>
                            <p>
                                If you have any questions about this Privacy Policy, please contact us at <a href="mailto:vaniscans@gmail.com" className="text-purple-400 underline">vaniscans@gmail.com</a>.
                            </p>
                        </section>
                    </div>
                </div>
            </main>
            <LegalFooter />
        </div>
    );
}
