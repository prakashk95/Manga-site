import React from 'react';
import Link from 'next/link';

export const metadata = {
    title: 'Terms of Service - VaniScans',
    description: 'Terms of Service and user agreement for VaniScans (vaniscans.online).',
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

export default function TermsPage() {
    return (
        <div className="min-h-screen flex flex-col bg-[#0b0c13] text-slate-100">
            <LegalHeader />
            <main className="flex-grow max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="bg-[#121422] border border-[#20243b] rounded-3xl p-6 sm:p-10 space-y-6 shadow-2xl">
                    <div className="border-b border-[#1f2337] pb-5">
                        <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-600/20 text-purple-300 border border-purple-500/30">
                            User Agreement
                        </span>
                        <h1 className="text-2xl sm:text-4xl font-black text-white mt-3">Terms of Service</h1>
                    </div>

                    <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">1. Acceptance of Terms</h2>
                            <p>
                                By accessing and using <strong>vaniscans.online</strong> (&quot;VaniScans&quot;), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our website.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">2. Use of the Platform</h2>
                            <p>
                                VaniScans provides a fan-operated reading interface for manga, manhwa, and webtoons for personal, non-commercial entertainment only. You agree not to misuse the platform, attempt unauthorized access to administrative routes, or disrupt our servers.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">3. User-Generated Comments</h2>
                            <p>
                                When posting comments on chapters, you agree not to post spam, malicious links, hate speech, harassment, or unlawful material. We reserve the right to remove any comments that violate community standards without prior notice.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">4. Intellectual Property & Third-Party Links</h2>
                            <p>
                                All manga titles, characters, and artwork belong to their respective authors, artists, and publishers. VaniScans claims no ownership over third-party intellectual property. Copyright owners may request removal at any time via our <Link href="/dmca" className="text-purple-400 underline">DMCA Policy</Link>.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">5. Disclaimer of Warranties</h2>
                            <p>
                                The website is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind. We do not guarantee uninterrupted availability or error-free operation.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">6. Changes to Terms</h2>
                            <p>
                                We may update these Terms of Service from time to time. Continued use of vaniscans.online constitutes acceptance of any revised terms. For questions, contact <a href="mailto:vaniscans@gmail.com" className="text-purple-400 underline">vaniscans@gmail.com</a>.
                            </p>
                        </section>
                    </div>
                </div>
            </main>
            <LegalFooter />
        </div>
    );
}
