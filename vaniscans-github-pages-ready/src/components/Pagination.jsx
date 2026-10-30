'use client';

import React from 'react';

export default function Pagination({ currentPage, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-center gap-3 pt-8 pb-4">
            <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border transition ${
                    currentPage > 1
                        ? 'bg-[#172336] hover:bg-[#1f304a] text-slate-200 border-[#24344d] cursor-pointer'
                        : 'bg-[#121c2c]/60 text-slate-600 border-[#1a263b] cursor-not-allowed'
                }`}
            >
                &larr; Prev page
            </button>

            <span className="text-xs text-slate-400 px-2">
                Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong>
            </span>

            <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold border transition ${
                    currentPage < totalPages
                        ? 'bg-[#172336] hover:bg-[#1f304a] text-slate-200 border-[#24344d] cursor-pointer'
                        : 'bg-[#121c2c]/60 text-slate-600 border-[#1a263b] cursor-not-allowed'
                }`}
            >
                Next page &rarr;
            </button>
        </div>
    );
}
