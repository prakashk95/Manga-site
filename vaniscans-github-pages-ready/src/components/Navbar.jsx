'use client';
import Link from 'next/link';
import { Search, Compass } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Navbar() {
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/?search=${encodeURIComponent(searchQuery.trim())}`);
        } else {
            router.push('/');
        }
    };

    return (
        <header className="bg-dark-800 border-b border-dark-700 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
                <Link href="/" className="text-xl font-black text-blue-500 tracking-wider">
                    VaniScans
                </Link>
                <form onSubmit={handleSearch} className="flex-1 max-w-xl relative">
                    <input
                        type="text"
                        placeholder="Search titles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-dark-900 border border-dark-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 pl-10"
                    />
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                </form>
                <div className="flex items-center gap-4">
                    <Link href="/" className="text-gray-300 hover:text-white flex items-center gap-1 text-sm font-medium">
                        <Compass className="w-4 h-4" /> Discover
                    </Link>
                </div>
            </div>
        </header>
    );
}