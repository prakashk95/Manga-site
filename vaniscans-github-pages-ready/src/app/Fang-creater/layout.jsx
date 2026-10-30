export const metadata = {
    title: 'Admin Studio',
    robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
        },
    },
};

export default function AdminLayout({ children }) {
    return <>{children}</>;
}
