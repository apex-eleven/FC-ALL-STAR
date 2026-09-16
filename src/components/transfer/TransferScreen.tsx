import { useEffect, useState } from 'react';
import { useTransfer } from '@/features/transfers/TransferContext';
import MarketTab from './MarketTab';
import OwnedTab from './OwnedTab';
import TransferHeader from './TransferHeader';
import styles from './TransferScreen.module.css';

type Tab = 'market' | 'owned';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'market', label: 'นักเตะ' },
  { id: 'owned', label: 'นักเตะของฉัน' },
];

/**
 * การเซ็นสัญญาดาวเด่น — buy catalogue cards with exchange points, or exchange owned
 * cards back for them. Two tabs along the bottom, the way the reference lays it out.
 */
export default function TransferScreen() {
  const { config } = useTransfer();
  const [tab, setTab] = useState<Tab>('market');
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (text: string) => setToast({ id: Date.now(), text });

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />
      <img className={styles.photo} src="/brand/transfer_background.jpg" alt="" onError={(event) => {
        event.currentTarget.style.display = 'none';
      }} />
      <div className={styles.photoScrim} />

      <TransferHeader title="การเซ็นสัญญาดาวเด่น" />

      {config.enabled ? (
        tab === 'market' ? (
          <MarketTab onToast={showToast} />
        ) : (
          <OwnedTab onToast={showToast} />
        )
      ) : (
        <p className={styles.closed}>ระบบเซ็นสัญญาปิดอยู่ชั่วคราว</p>
      )}

      <nav className={styles.tabs} aria-label="การเซ็นสัญญา">
        {TABS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className={`${styles.tab} ${tab === entry.id ? styles.tabOn : ''}`}
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => setTab(entry.id)}
          >
            {tab === entry.id && <span className={styles.pointer} />}
            {entry.label}
          </button>
        ))}
      </nav>

      {toast && (
        <div key={toast.id} className={styles.toast} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
