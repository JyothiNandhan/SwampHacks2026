export type PurchaseView = {
    id: string;
    name: string;
    merchant: string;
    category: string;
    date: string;
    price: number;
    status: 'Price drop' | 'Protected' | 'Return window' | 'Recovered' | 'Review needed';
    saving: number;
    icon: string;
    deadline?: string;
};
export const demoPurchases: PurchaseView[] = [
    { id: 'demo-1', name: 'QuietComfort Ultra', merchant: 'Bose', category: 'Electronics', date: '2026-10-14', price: 42900, status: 'Price drop', saving: 8000, icon: 'headphones', deadline: '3 days' },
    { id: 'demo-2', name: 'Air Zoom Pegasus 41', merchant: 'Nike', category: 'Lifestyle', date: '2026-10-12', price: 14000, status: 'Return window', saving: 2800, icon: 'shoe', deadline: '6 days' },
    { id: 'demo-3', name: 'Studio Display', merchant: 'Apple', category: 'Electronics', date: '2026-10-09', price: 159900, status: 'Protected', saving: 0, icon: 'monitor' },
    { id: 'demo-4', name: 'Everyday Backpack', merchant: 'Bellroy', category: 'Lifestyle', date: '2026-10-07', price: 17900, status: 'Recovered', saving: 3500, icon: 'bag' },
    { id: 'demo-5', name: 'Artisan Stand Mixer', merchant: 'KitchenAid', category: 'Home', date: '2026-10-04', price: 34900, status: 'Protected', saving: 0, icon: 'mixer' }
];
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
