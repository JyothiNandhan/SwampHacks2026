'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { demoPurchases, money, type PurchaseView } from '../lib/demo';
type Section = 'Overview' | 'Purchases' | 'Opportunities' | 'Recovery center' | 'Activity';
type Modal = 'connect' | 'upload' | 'notifications' | 'help' | PurchaseView | null;
interface Opportunity {
    id: string;
    purchaseId: string | null;
    estimatedSavingsCents: number | null;
    status: string;
    type: string;
}
interface Case {
    id: string;
    status: string;
    opportunityId: string;
}
async function request(path: string, init?: RequestInit) { const r = await fetch(path, { ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } }); const body = await r.json(); if (!r.ok)
    throw new Error(body.error?.message ?? 'Something went wrong. Please try again.'); return body; }
export function Dashboard() {
    const [section, setSection] = useState<Section>('Overview');
    const [modal, setModal] = useState<Modal>(null);
    const [connected, setConnected] = useState(false);
    const [purchases, setPurchases] = useState<PurchaseView[]>(demoPurchases);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [cases, setCases] = useState<Case[]>([]);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('All purchases');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');
    const [token, setToken] = useState('');
    const [demoReviewed, setDemoReviewed] = useState<string[]>([]);
    const [range, setRange] = useState('This month');
    const [uploadSource, setUploadSource] = useState('EMAIL');
    const dialog = useRef<HTMLDialogElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    function notify(message: string) { setToast(message); }
    useEffect(() => { if (!toast)
        return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
    useEffect(() => { if (modal) {
        setError('');
        dialog.current?.showModal();
    }
    else if (dialog.current?.open)
        dialog.current.close(); }, [modal]);
    async function loadLive() {
        const [p, o] = await Promise.all([request('/api/backend/purchases'), request('/api/backend/opportunities')]);
        setPurchases(p.data.map((x: {
            id: string;
            merchantName: string;
            purchasedAt: string;
            amountCents: number;
            items: {
                name: string;
            }[];
        }) => ({ id: x.id, name: x.items[0]?.name ?? 'Purchase awaiting receipt', merchant: x.merchantName, category: 'Uncategorized', date: x.purchasedAt, price: x.amountCents, status: 'Review needed', saving: 0, icon: 'bag' })));
        setOpportunities(o.data);
        setCases([]);
        setConnected(true);
    }
    useEffect(() => { let active = true; request('/api/session').then(async (s) => { if (s.connected && active) {
        try {
            await loadLive();
        }
        catch (e) {
            if (active)
                setError((e as Error).message);
        }
    } }).catch(() => { }); return () => { active = false; }; }, []);
    const visible = purchases.filter(p => `${p.name} ${p.merchant}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All purchases' || p.status === filter));
    const possible = connected ? opportunities.filter(o => ['DETECTED', 'REVIEW'].includes(o.status)).reduce((n, o) => n + (o.estimatedSavingsCents ?? 0), 0) : 10800;
    const recovered = connected ? null : 3500;
    const opportunitiesCount = connected ? opportunities.length : 2;
    async function connect(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try {
        await request('/api/session', { method: 'POST', body: JSON.stringify({ token }) });
        setToken('');
        await loadLive();
        setModal(null);
        notify('Connected. You are viewing your live account.');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function disconnect() { try {
        await request('/api/session', { method: 'DELETE' });
        setConnected(false);
        setPurchases(demoPurchases);
        setOpportunities([]);
        setCases([]);
        setModal(null);
        notify('Disconnected. Exploring sample data.');
    }
    catch (e) {
        setError((e as Error).message);
    } }
    async function upload(file: File) { setError(''); if (!connected) {
        setError('Connect your account before uploading a receipt.');
        return;
    } if (file.size > 4 * 1024 * 1024) {
        setError('Choose a receipt smaller than 4 MB.');
        return;
    } setBusy(true); try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (const byte of bytes)
            binary += String.fromCharCode(byte);
        const uploaded = await request('/api/backend/documents', { method: 'POST', body: JSON.stringify({ mimeType: file.type || 'text/plain', contentBase64: btoa(binary) }) });
        await request('/api/backend/receipts/ingest', { method: 'POST', body: JSON.stringify({ source: uploadSource, originalFileId: uploaded.data.originalFileId }) });
        notify('Receipt extracted and securely saved. Matching is still required.');
        setModal(null);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
        if (fileInput.current)
            fileInput.current.value = '';
    } }
    function selectSection(value: Section) { setSection(value); setQuery(''); setFilter('All purchases'); setError(''); }
    return <div className="app-shell">
 <aside className="sidebar"><a href="/" className="brand" aria-label="MoneyBack home"><span className="brand-mark">m<span>↗</span></span><span>moneyback<span className="brand-dot">.</span></span></a><div className="workspace"><span className="workspace-avatar">M</span><div>Personal workspace<small>Your everyday, protected</small></div><span className="chevrons">⌃<br />⌄</span></div><div className="nav-label">WORKSPACE</div><nav aria-label="Main navigation">{(['Overview', 'Purchases', 'Opportunities', 'Recovery center', 'Activity'] as Section[]).map((name, i) => <button key={name} className={section === name ? 'nav-item active' : 'nav-item'} onClick={() => selectSection(name)}><Icon name={['grid', 'bag', 'sparkle', 'shield', 'activity'][i]}/><span>{name}</span>{name === 'Opportunities' && opportunitiesCount > 0 && <b>{opportunitiesCount}</b>}</button>)}</nav><div className="sidebar-bottom"><div className="protection-mini"><span className="mini-orbit"><Icon name="shield" size={23}/></span><strong>A little peace of mind.</strong><p>Your purchases deserve<br />a second look.</p><button onClick={() => setModal('help')}>How MoneyBack works <Icon name="arrow" size={15}/></button></div><button className="nav-item" onClick={() => setModal('help')}><Icon name="help"/>Help & getting started</button><button className="profile" onClick={() => setModal('connect')}><span className="avatar">{connected ? 'YO' : 'DE'}</span><span>{connected ? 'Your account' : 'Demo explorer'}<small>{connected ? 'Live workspace' : 'Sample workspace'}</small></span><Icon name="settings" size={18}/></button></div></aside>
 <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span><strong>{section}</strong></div><div className="top-actions"><span className={`connection ${connected ? 'live' : ''}`}><i />{connected ? 'Live account' : 'Demo mode'}</span><button className="icon-button" aria-label="Open notifications" onClick={() => setModal('notifications')}><Icon name="bell"/><i className="notification-dot"/></button><button className="avatar top-avatar" onClick={() => setModal('connect')} aria-label="Account settings">{connected ? 'YO' : 'DE'}</button></div></header>
 <main><section className="page-heading"><div><div className="eyebrow"><span /> LESS FRICTION. MORE MONEY BACK.</div><h1>{section === 'Overview' ? 'Good things come back.' : section === 'Recovery center' ? 'Every recovery, in view.' : section === 'Activity' ? 'Your money in motion.' : section === 'Opportunities' ? 'A second look pays off.' : 'Every purchase has a story.'}</h1><p>{section === 'Overview' ? 'A little oversight for everything you buy. Let’s find what’s yours.' : section === 'Purchases' ? 'Receipts, protection windows, and price changes. All in one place.' : section === 'Opportunities' ? 'Understand the evidence before you take the next step.' : section === 'Activity' ? 'Follow the small steps that bring your money full circle.' : 'Review your cases and stay in control of every next step.'}</p></div><button className="primary" onClick={() => setModal('upload')}><Icon name="plus" size={18}/> Add receipt</button></section>
 {!connected && <div className="demo-banner"><span><Icon name="sparkle" size={15}/><strong>A glimpse of what’s possible.</strong> You’re exploring sample data.</span><button onClick={() => setModal('connect')}>Connect your account <Icon name="arrow" size={15}/></button></div>}
 {error && <div className="error-banner" role="alert">{error}<button onClick={() => setModal('connect')}>Account settings</button></div>}
 {section === 'Overview' && <><section className="overview-grid"><div className="recovery-hero"><div className="hero-top"><span><span className="small-star">✧</span> YOUR RECOVERY OUTLOOK</span><span className="subtle-pill">{connected ? 'Live account' : 'Sample outlook'}</span></div><div className="hero-amount">{money(possible)}<span>worth a second look</span></div><p>Small price changes. Missed opportunities.<br />It all adds up to money that could come back.</p><button onClick={() => selectSection('Opportunities')}>Explore opportunities <Icon name="arrow" size={18}/></button><div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><span className="orbit-symbol">↗</span><span className="orbit-coin">$</span><span className="orbit-spark">✧</span></div><div className="hero-foot"><Icon name="shield" size={15}/> Potential savings require verification and your approval.</div></div><div className="stat-stack"><div className="stat-card"><span className="stat-icon mint"><Icon name="arrow"/></span><span className="stat-label">Money recovered <span title="Demo recovery is simulated. Live confirmed totals are not available yet.">ⓘ</span></span><strong>{recovered === null ? '—' : money(recovered)}</strong><small>{connected ? 'Confirmed total unavailable' : 'Simulated recovery · sample data'}</small><div className="tiny-bars" aria-hidden="true">{[28, 45, 35, 62, 50, 76, 65, 88, 74, 100, 85, 110].map((h, i) => <i key={i} style={{ height: h / 3 }}/>)}</div></div><div className="stat-card"><span className="stat-icon lilac"><Icon name="shield"/></span><span className="stat-label">Purchases tracked</span><strong>{purchases.length.toString().padStart(2, '0')}<span className="stat-unit">purchases</span></strong><small>Receipts make the picture clearer.</small><div className="coverage-dots" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} className={i < 17 ? 'filled' : ''}/>)}</div></div></div></section>
 <section className="insight-strip"><span className="insight-icon"><Icon name="sparkle" size={19}/></span><p><strong>{connected ? 'Your next move starts with a receipt.' : 'Your headphones just got a little more affordable.'}</strong><span>{connected ? 'Add evidence to uncover opportunities with confidence.' : 'A sample $80 price drop is ready for a closer look.'}</span></p><button onClick={() => connected ? setModal('upload') : setModal(demoPurchases[0])}>{connected ? 'Add evidence' : 'Take a look'} <Icon name="arrow" size={17}/></button></section></>}
 {(section === 'Overview' || section === 'Purchases') && <section className="purchases-section"><div className="section-heading"><div><h2>{section === 'Overview' ? 'Your recent purchases' : 'Your purchases'}<span className="count-tag">{purchases.length}</span></h2><p>A clearer picture of what you own, and what you’re owed.</p></div>{section === 'Overview' && <button className="text-button" onClick={() => selectSection('Purchases')}>View all purchases <Icon name="arrow" size={16}/></button>}</div><div className="table-tools"><div className="table-tabs">{['All purchases', 'Price drop', 'Protected', 'Return window'].map(name => <button className={filter === name ? 'selected' : ''} key={name} onClick={() => setFilter(name)}>{name}{name === 'All purchases' && <span>{purchases.length}</span>}</button>)}</div><label className="search"><Icon name="search" size={16}/><input placeholder="Search purchases…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search purchases"/></label></div><div className="table-scroll"><table><thead><tr><th>ITEM / MERCHANT</th><th>PURCHASE DATE</th><th>AMOUNT</th><th>STATUS</th><th>POTENTIAL RETURN</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{visible.slice(0, section === 'Overview' ? 4 : undefined).map(p => <tr key={p.id} onClick={() => setModal(p)}><td><div className="product-cell"><span className={`product-art ${p.icon}`}><Icon name={p.icon} size={27}/></span><span><button className="product-name" onClick={e => { e.stopPropagation(); setModal(p); }}>{p.name}</button><small>{p.merchant} <span>·</span> {p.category}</small></span></div></td><td>{new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</td><td className="amount-cell">{money(p.price)}</td><td><span className={`status-pill ${p.status.toLowerCase().replace(' ', '-')}`}><i />{p.status}</span></td><td className={p.saving ? 'saving-cell' : 'muted'}>{p.saving ? `+ ${money(p.saving)}` : '—'}</td><td><button className="row-arrow" aria-label={`View ${p.name}`} onClick={e => { e.stopPropagation(); setModal(p); }}><Icon name="arrow" size={17}/></button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty"><Icon name="search" size={28}/><h3>{purchases.length ? 'No matching purchases' : 'A fresh start for your purchases.'}</h3><p>{purchases.length ? 'Try a different search or status.' : 'Add a receipt to start building your purchase history.'}</p><button className="secondary" onClick={() => purchases.length ? (setQuery(''), setFilter('All purchases')) : setModal('upload')}>{purchases.length ? 'Clear filters' : 'Add a receipt'}</button></div>}</div><div className="table-footer"><span>{connected ? 'Showing the latest page of your account data.' : 'Illustrative purchases. No real funds or claims.'}</span><Icon name="shield" size={14}/><span>You’re always in control.</span></div></section>}
 {section === 'Opportunities' && <section className="opportunity-grid">{connected ? opportunities.length ? opportunities.map(o => <article className="opportunity-card" key={o.id}><span className="stat-icon mint"><Icon name="sparkle"/></span><span className="eyebrow">{o.type.replaceAll('_', ' ')}</span><h2>{o.estimatedSavingsCents === null ? 'To review' : money(o.estimatedSavingsCents)}</h2><p>Status: {o.status.toLowerCase()}. Review the linked purchase and evidence before creating a recovery case.</p><button className="secondary" onClick={() => { const p = purchases.find(p => p.id === o.purchaseId); p ? setModal(p) : notify('The linked purchase is not on the current page.'); }}>View purchase <Icon name="arrow" size={16}/></button></article>) : <div className="empty"><Icon name="sparkle" size={32}/><h2>Room for good surprises.</h2><p>No opportunities yet. Add receipts and check back as evidence becomes available.</p></div> : demoPurchases.filter(p => p.saving && p.status !== 'Recovered').map(p => <article className="opportunity-card" key={p.id}><span className={`product-art ${p.icon}`}><Icon name={p.icon} size={35}/></span><span className="subtle-label">SAMPLE OPPORTUNITY</span><h2>{p.name}</h2><p>{p.status === 'Price drop' ? 'A lower sample price was spotted. Compare the exact model and policy before taking action.' : 'Your sample return window is closing. Check eligibility and item condition.'}</p><div className="opportunity-value"><strong>{money(p.saving)}</strong><span>potential return</span><span className="deadline"><Icon name="clock" size={14}/>{p.deadline} left</span></div><button className="primary" onClick={() => setModal(p)}>Review opportunity <Icon name="arrow" size={16}/></button></article>)}</section>}
 {section === 'Recovery center' && <section className="panel"><div className="section-heading"><div><h2>Your recovery journey</h2><p>Approval is always yours. Reimbursements are simulated in this sandbox.</p></div></div>{connected ? cases.length ? cases.map(c => <div className="activity-row" key={c.id}><span className="stat-icon mint"><Icon name="shield"/></span><div><strong>Recovery case {c.id.slice(0, 8)}</strong><p>{c.status.replaceAll('_', ' ').toLowerCase()}</p></div></div>) : <div className="empty"><Icon name="shield" size={32}/><h3>Start with the evidence.</h3><p>Review your opportunities before taking action. Existing case history is not available in this view yet.</p><button className="primary" onClick={() => selectSection('Opportunities')}>Explore opportunities</button></div> : <><div className="recovery-summary"><div><span className="subtle-label">SAMPLE SIMULATED RECOVERY</span><h2>{money(3500)}</h2><p>Everyday Backpack · Bellroy</p></div><span className="status-pill recovered"><i />Simulated refund</span></div><div className="journey">{['Opportunity found', 'Evidence reviewed', 'You approved', 'Simulated refund'].map((s, i) => <div key={s}><span><Icon name="check" size={17}/></span><strong>{s}</strong><small>{['Price difference detected', 'Receipt and policy checked', 'Your decision, recorded', 'Sandbox demonstration'][i]}</small></div>)}</div><p className="sample-note">This is an illustrative recovery journey. No merchant claim or real reimbursement has been submitted.</p></>}</section>}
 {section === 'Activity' && <section className="panel"><div className="section-heading"><div><h2>Workspace activity</h2><p>{connected ? 'Open a purchase to inspect its details.' : 'A sample timeline of the little wins.'}</p></div><select value={range} onChange={e => setRange(e.target.value)} aria-label="Activity period"><option>This month</option><option>This week</option></select></div>{connected ? <div className="empty"><Icon name="activity" size={30}/><h3>Your story starts here.</h3><p>Detailed timelines remain attached to individual purchases. Sample activity is hidden in live mode.</p></div> : (range === 'This week' ? [0, 1] : [0, 1, 2, 3]).map((n) => <div className="activity-row" key={n}><span className={`stat-icon ${n === 2 ? 'lilac' : 'mint'}`}><Icon name={['sparkle', 'receipt', 'shield', 'check'][n]}/></span><div><strong>{['Price drop spotted', 'Receipt added', 'Protection window checked', 'Simulated recovery completed'][n]}</strong><p>{['QuietComfort Ultra · $80 sample difference', 'Air Zoom Pegasus 41 · Evidence organized', 'Studio Display · Return policy reviewed', 'Everyday Backpack · $35 sample recovery'][n]}</p></div><small>{['Today', 'Yesterday', 'Oct 9', 'Oct 7'][n]}</small></div>)}</section>}
 {section === 'Overview' && <section className="bottom-grid"><div className="protection-card"><div className="section-heading"><h2>Your next best move</h2><span className="soft-icon"><Icon name="clock" size={18}/></span></div><p>{connected ? 'Keep your receipts close.' : 'A return window is closing soon.'}</p><div className="next-action"><span className="product-art shoe"><Icon name={connected ? 'receipt' : 'shoe'} size={24}/></span><div><strong>{connected ? 'Complete your purchase picture' : 'Air Zoom Pegasus 41'}</strong><small>{connected ? 'Receipts help establish item identity' : 'Sample deadline · 6 days remaining'}</small></div><button className="icon-button" aria-label="View next step" onClick={() => setModal(connected ? 'upload' : demoPurchases[1])}><Icon name="arrow" size={19}/></button></div></div><div className="quiet-card"><span className="quiet-mark"><Icon name="shield" size={36}/></span><div><span className="eyebrow">BUILT AROUND YOUR TRUST</span><h3>Your money. Your move.</h3><p>We bring the evidence together.<br />You decide what happens next.</p></div></div></section>}
 <footer><span className="footer-brand">moneyback.</span><span>A little attention. A better return.</span><span className="footer-right"><i />{connected ? 'Connected workspace' : 'Sample workspace'} · USD</span></footer>
 </main></div>
 <dialog ref={dialog} className="modal" aria-label="MoneyBack workspace dialog" onCancel={() => { setModal(null); setToken(''); }} onClick={e => { if (e.target === dialog.current) {
        setModal(null);
        setToken('');
    } }}><div className="modal-header"><span className="brand-dot">✧</span><button className="icon-button" aria-label="Close dialog" onClick={() => { setModal(null); setToken(''); }}><Icon name="close"/></button></div>
 {modal === 'connect' && <><span className="eyebrow">YOUR WORKSPACE</span><h2>{connected ? 'You’re connected.' : 'Make room for your money.'}</h2><p>{connected ? 'Your account data comes directly from the secured MoneyBack API.' : 'Connect with your provisioned per-user access token. It stays in a secure HTTP-only session cookie and expires after one hour.'}</p>{connected ? <button className="secondary" onClick={() => void disconnect()}><Icon name="logout" size={17}/> Disconnect account</button> : <form onSubmit={connect}><label className="field-label" htmlFor="access-token">Account access token</label><input id="access-token" className="field-input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your per-user token" autoComplete="off" required/><small className="form-help">Use your account token, never a provider API key.</small><button className="primary wide" disabled={busy}>{busy ? 'Connecting…' : 'Connect securely'}<Icon name="arrow" size={17}/></button></form>}</>}
 {modal === 'upload' && <><span className="eyebrow">BUILD THE EVIDENCE</span><h2>A receipt is a good start.</h2><p>Add a receipt to extract item details. Matching it to a purchase is a separate review step.</p><label className="field-label" htmlFor="receipt-source">Receipt source</label><select id="receipt-source" className="field-input" value={uploadSource} onChange={e => setUploadSource(e.target.value)}><option value="EMAIL">Email receipt</option><option value="PHOTO">Receipt photo</option><option value="PDF">PDF receipt</option></select><input ref={fileInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/json" onChange={e => { if (e.target.files?.[0])
        void upload(e.target.files[0]); }}/><button className="upload-zone" disabled={busy || !connected} onClick={() => fileInput.current?.click()}><Icon name="upload" size={30}/><strong>{busy ? 'Extracting your receipt…' : 'Choose a receipt'}</strong><span>JPG, PNG, WebP, PDF or text · up to 4 MB</span></button>{!connected && <button className="primary wide" onClick={() => setModal('connect')}>Connect to upload <Icon name="arrow" size={17}/></button>}<p className="form-help">Files are private to your account. Keep this window open while extraction finishes.</p></>}
 {modal === 'help' && <><span className="eyebrow">A LITTLE OVERSIGHT GOES A LONG WAY</span><h2>From purchase to possibility.</h2><div className="help-steps">{[['receipt', 'Bring your receipts', 'Add evidence to establish exactly what you bought.'], ['sparkle', 'Spot the possibilities', 'Review price observations and protection windows.'], ['shield', 'Make your move', 'Check the evidence and approve each recovery step yourself.']].map(([icon, title, text], i) => <div key={title}><span className="stat-icon mint"><Icon name={icon}/></span><div><strong>{i + 1}. {title}</strong><p>{text}</p></div></div>)}</div><p className="sample-note">This is a sandbox. Reimbursements are simulated; recovery is never guaranteed.</p></>}
 {modal === 'notifications' && <><span className="eyebrow">ON YOUR RADAR</span><h2>{connected ? 'Keep an eye on your purchases.' : 'A couple of good reasons to look.'}</h2><p>{connected ? 'Live notification history is not connected in this view yet. Your purchase data is available in the Purchases tab.' : 'These sample alerts show how MoneyBack helps you stay a step ahead.'}</p>{!connected && demoPurchases.slice(0, 2).map(p => <button key={p.id} className="notification-item" onClick={() => setModal(p)}><Icon name={p.icon}/><span><strong>{p.name}</strong><small>{p.status} · {money(p.saving)} potential</small></span><Icon name="arrow" size={16}/></button>)}</>}
 {modal && typeof modal === 'object' && <><span className={`product-art detail-art ${modal.icon}`}><Icon name={modal.icon} size={40}/></span><span className="eyebrow">{connected ? 'PURCHASE DETAILS' : 'SAMPLE PURCHASE'}</span><h2>{modal.name}</h2><p>{modal.merchant} · Purchased {new Date(modal.date).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })}</p><div className="detail-money"><span>Purchase amount<strong>{money(modal.price)}</strong></span><span>Potential return<strong className="green">{modal.saving ? money(modal.saving) : '—'}</strong></span></div><h3>Before you take the next step</h3><ul className="evidence-list"><li><Icon name="receipt" size={17}/> Verify the receipt and exact product model.</li><li><Icon name="bag" size={17}/> Check seller, stock, condition, and shipping.</li><li><Icon name="shield" size={17}/> Confirm policy eligibility and deadlines.</li></ul>{connected ? <p className="sample-note">This purchase is tracked. Recovery requires verified evidence and an eligible opportunity.</p> : <><button className="primary wide" disabled={demoReviewed.includes(modal.id)} onClick={() => { setDemoReviewed(v => [...v, modal.id]); notify('Sample marked as reviewed. No real claim was submitted.'); }}>{demoReviewed.includes(modal.id) ? 'Sample reviewed' : 'Mark sample as reviewed'}<Icon name="check" size={17}/></button><p className="form-help">Demo only. This does not approve or submit a real claim.</p></>}</>}
 {error && modal && <p className="form-error" role="alert">{error}</p>}</dialog>
 {toast && <div className="toast" role="status"><Icon name="check" size={18}/>{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><Icon name="close" size={16}/></button></div>}
 </div>;
}
