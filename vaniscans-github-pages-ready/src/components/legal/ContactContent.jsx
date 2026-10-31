import React from 'react';


export const metadata = {
    title: 'Contact Us & DMCA Inquiries - VaniScans',
    description: 'Digital Millennium Copyright Act (DMCA) policy and takedown notice procedure for VaniScans (vaniscans.online).',
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

export default function ContactPage() {
    return (
        <div className="min-h-screen flex flex-col bg-[#0b0c13] text-slate-100">
            <LegalHeader />
            <main className="flex-grow max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="bg-[#121422] border border-[#20243b] rounded-3xl p-6 sm:p-10 space-y-6 shadow-2xl">
                    <div className="border-b border-[#1f2337] pb-5">
                        <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-600/20 text-purple-300 border border-purple-500/30">
                            Legal & Copyright
                        </span>
                        <h1 className="text-2xl sm:text-4xl font-black text-white mt-3">Contact Us</h1>
                    </div>

                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm leading-relaxed font-medium">
                        <strong>Important Notice:</strong> Vaniscans.online is a fan-operated manga reading website. We are not affiliated with any official manga publisher or licensor. We take copyright infringement seriously and will respond promptly to all valid DMCA notices.
                    </div>

                    <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">1. Our Commitment</h2>
                            <p>
                                vaniscans.online respects the intellectual property rights of manga authors, publishers, and all content creators. In accordance with the Digital Millennium Copyright Act of 1998 (DMCA), we have established this policy to address claims of copyright infringement. We will remove infringing content promptly upon receiving a valid notice.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-lg font-black text-white">2. How to Submit a DMCA Takedown Notice</h2>
                            <p>
                                If you believe that content on Vaniscans.online infringes your copyright, please send a written DMCA notice to our designated agent at:
                            </p>
                            <div className="p-4 rounded-xl bg-[#181b2e] border border-purple-500/30 inline-block font-bold text-purple-300">
                                📧 DMCA Email: <a href="mailto:vaniscans@gmail.com" className="underline hover:text-white">vaniscans@gmail.com</a>
                            </div>
                            <p className="font-semibold text-white pt-1">Your notice must include all of the following:</p>
                            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
                                <li>A physical or electronic signature of the copyright owner or a person authorized to act on their behalf</li>
                                <li>Identification of the copyrighted work(s) you claim has been infringed</li>
                                <li>Identification of the specific material on Vaniscans.online that you claim is infringing, with enough detail for us to locate it (e.g., the URL of the page)</li>
                                <li>Your full name, mailing address, telephone number, and email address</li>
                                <li>A statement that you have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law</li>
                                <li>A statement, made under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on the copyright owner&apos;s behalf</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">3. Response Time</h2>
                            <p>
                                We aim to process all valid DMCA notices within 3–5 business days. Upon receipt of a valid notice, we will remove or disable access to the allegedly infringing content and notify the user who posted the content.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-lg font-black text-white">4. Counter-Notice</h2>
                            <p>
                                If you believe your content was removed by mistake or misidentification, you may submit a counter-notice to <a href="mailto:vaniscans@gmail.com" className="text-purple-400 underline">vaniscans@gmail.com</a> containing:
                            </p>
                            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
                                <li>Your physical or electronic signature</li>
                                <li>Identification of the material that was removed and its location before removal</li>
                                <li>A statement under penalty of perjury that you have a good faith belief the material was removed by mistake</li>
                                <li>Your name, address, telephone number, and a statement that you consent to the jurisdiction of the applicable court</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">5. Repeat Infringers</h2>
                            <p>
                                It is our policy to terminate access for users who are repeat infringers of intellectual property rights in appropriate circumstances.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-lg font-black text-white">6. No Endorsement</h2>
                            <p>
                                Vaniscans.online does not endorse or encourage copyright infringement. We are a fan reading platform, and we respect the work of all manga creators and publishers.
                            </p>
                        </section>
                    </div>
                </div>
            </main>
            <LegalFooter />
        </div>
    );
}
