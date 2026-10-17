import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'MoneyBack — Your money, coming full circle.', description: 'A calmer way to track purchases, spot price drops, and recover what is yours.' };
export default function Layout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en"><body>{children}</body></html>; }
