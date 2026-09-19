import { useMemo, useState } from 'react';
import { Check, ChevronLeft, Gift, Home } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import type { CurrencyKind } from '@/features/currencies/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { CODE_MAX, normalizeCodeText } from '@/features/redeem/constants';
import { useRedeem, type RedeemResult } from '@/features/redeem/RedeemContext';
import type { RedeemError } from '@/features/redeem/types';
import CurrencyItem from '@/components/currency/CurrencyItem';
import IconButton from '@/components/ui/IconButton';
import useRewardView from '@/components/shop/useRewardView';
import styles from './RedeemScreen.module.css';

const HEADER_CURRENCIES: readonly CurrencyKind[] = ['special', 'gem', 'fcpoint'];

/**
 * A wrong code and one that exists but is not live read the same on purpose — the
 * screen must not become a way to find out which codes are real.
 */
const ERROR: Record<RedeemError, string> = {
  closed: 'ระบบแลกโค้ดปิดอยู่ตอนนี้',
  blank: 'พิมพ์โค้ดก่อนนะ',
  unknown: 'โค้ดนี้ใช้ไม่ได้ ลองเช็กตัวสะกดอีกครั้ง',
  disabled: 'โค้ดนี้ใช้ไม่ได้ ลองเช็กตัวสะกดอีกครั้ง',
  'not-started': 'ยังไม่ถึงเวลาใช้โค้ดนี้',
  expired: 'โค้ดนี้หมดอายุแล้ว',
  used: 'ไอดีนี้ใช้โค้ดนี้ครบแล้ว',
  empty: 'โค้ดนี้ยังไม่ได้ตั้งรางวัล ติดต่อแอดมิน',
  'at-cap': 'ยอดเงินเต็มแล้ว ใช้ของก่อนแล้วค่อยแลกใหม่',
  'club-full': 'คลังนักเตะเต็ม เคลียร์ที่ว่างก่อนแล้วค่อยแลก',
  'card-missing': 'การ์ดรางวัลของโค้ดนี้ถูกลบไปแล้ว ติดต่อแอดมิน',
};

/** แลกโค้ด — type a code, get what the admin hung on it. */
export default function RedeemScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { config, progress, redeem } = useRedeem();
  const view = useRewardView();

  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);

  /** Codes this account has already used, newest first. */
  const history = useMemo(() => {
    return config.codes
      .map((code) => ({ code, use: progress.used[code.id] }))
      .filter((row): row is { code: (typeof config.codes)[number]; use: { count: number; at: string } } =>
        Boolean(row.use),
      )
      .sort((a, b) => b.use.at.localeCompare(a.use.at));
  }, [config.codes, progress.used]);

  function submit() {
    if (!normalizeCodeText(typed)) {
      setResult({ ok: false, error: 'blank', code: null, rewards: [], cards: [] });
      return;
    }
    const outcome = redeem(typed);
    setResult(outcome);
    if (outcome.ok) setTyped('');
  }

  const won = result?.ok ? result : null;

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />

      <header className={styles.bar}>
        <div className={styles.left}>
          <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
            <ChevronLeft size={38} strokeWidth={3} />
          </button>
          <h1 className={styles.title}>{config.title}</h1>
        </div>
        <div className={styles.right}>
          {HEADER_CURRENCIES.map((kind) => (
            <CurrencyItem key={kind} currency={currencies[kind]} balance={account.wallet[kind]} />
          ))}
          <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </div>
      </header>

      <section className={styles.panel} aria-label="แลกโค้ด">
        <Gift className={styles.mark} size={72} strokeWidth={1.6} aria-hidden="true" />

        <div className={styles.entry}>
          <input
            className={styles.input}
            value={typed}
            maxLength={CODE_MAX}
            spellCheck={false}
            autoComplete="off"
            placeholder="พิมพ์โค้ดตรงนี้"
            aria-label="โค้ด"
            // Upper-cased as typed so what is on screen is exactly what is matched.
            onChange={(event) => {
              setTyped(normalizeCodeText(event.target.value));
              setResult(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <button
            type="button"
            className={styles.submit}
            disabled={!config.enabled || typed.length === 0}
            onClick={submit}
          >
            แลกรับ
          </button>
        </div>

        {config.note && <p className={styles.note}>{config.note}</p>}

        {result && !result.ok && result.error && (
          <p className={styles.bad} role="status">
            {ERROR[result.error]}
          </p>
        )}

        {won && (
          <div className={styles.won} role="status">
            <span className={styles.wonHead}>
              <Check size={22} strokeWidth={3} />
              ได้รับรางวัลจากโค้ด {won.code?.name.trim() || won.code?.code}
            </span>
            <div className={styles.wonList}>
              {won.rewards.map((reward, index) => {
                const shown = view(reward);
                return (
                  <span className={styles.wonItem} key={`${shown.label}-${index}`}>
                    <img className={shown.isCard ? styles.wonPortrait : styles.wonIcon} src={shown.icon} alt="" />
                    <span className={styles.wonLabel}>{shown.label}</span>
                    <span className={styles.wonCount}>{shown.count}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <aside className={styles.history} aria-label="โค้ดที่เคยแลก">
        <h2 className={styles.historyTitle}>โค้ดที่เคยแลก</h2>
        {history.length === 0 && <p className={styles.empty}>ยังไม่เคยแลกโค้ดไหนเลย</p>}
        {history.map(({ code, use }) => (
          <div className={styles.row} key={code.id}>
            <span className={styles.rowName}>{code.name.trim() || code.code}</span>
            <span className={styles.rowCode}>{code.code}</span>
            <span className={styles.rowMeta}>
              {use.count > 1 ? `x${use.count} · ` : ''}
              {use.at ? new Date(use.at).toLocaleDateString('th-TH') : ''}
            </span>
          </div>
        ))}
      </aside>
    </div>
  );
}
