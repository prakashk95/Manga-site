export const DEFAULT_MONETIZATION = {
    gaEnabled: false,
    gaMeasurementId: '',
    gaCustomScript: '',
    ads: {
        beforeFirst: {
            id: 'beforeFirst',
            label: '1. Before 1st Image',
            desc: 'Displayed at the very top of the chapter before Page 1.',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x160/1e1b4b/c4b5fd?text=SPONSORED:+Play+Shadow+Monarch+RPG+(Before+1st+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        },
        afterFifth: {
            id: 'afterFifth',
            label: '2. After 5th Image',
            desc: 'Injected automatically right after Page 5 (when chapter has ≥ 5 pages).',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x160/311042/f0abfc?text=AD+BREAK:+Unlock+Premium+Webtoons+(After+5th+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        },
        afterTenth: {
            id: 'afterTenth',
            label: '3. After 10th Image',
            desc: 'Injected automatically right after Page 10 (when chapter has ≥ 10 pages).',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x160/0f2942/7dd3fc?text=MID-CHAPTER+PROMO:+Merch+Store+50%25+OFF+(After+10th+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        },
        afterLast: {
            id: 'afterLast',
            label: '4. After Last Image',
            desc: 'Displayed at the end of the chapter immediately after the final page.',
            enabled: false,
            mode: 'banner',
            imageUrl: 'https://placehold.co/900x180/142e24/6ee7b7?text=CHAPTER+END+SPONSOR:+Join+Our+Discord+Community+(After+Last+Image)',
            linkUrl: 'https://example.com',
            htmlCode: ''
        }
    }
};

export function mergeMonetization(raw) {
    if (!raw || typeof raw !== 'object') return JSON.parse(JSON.stringify(DEFAULT_MONETIZATION));
    return {
        ...DEFAULT_MONETIZATION,
        ...raw,
        ads: {
            beforeFirst: { ...DEFAULT_MONETIZATION.ads.beforeFirst, ...(raw.ads?.beforeFirst || {}) },
            afterFifth: { ...DEFAULT_MONETIZATION.ads.afterFifth, ...(raw.ads?.afterFifth || {}) },
            afterTenth: { ...DEFAULT_MONETIZATION.ads.afterTenth, ...(raw.ads?.afterTenth || {}) },
            afterLast: { ...DEFAULT_MONETIZATION.ads.afterLast, ...(raw.ads?.afterLast || {}) }
        }
    };
}
