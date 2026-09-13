import { useState, type FormEvent } from 'react';
import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  checkPassword,
  checkUsername,
  isAdminUsername,
  nameLength,
} from '@/features/auth/constants';
import { useAuth } from '@/features/auth/AuthContext';
import type { AuthError } from '@/features/auth/types';
import { STARTING_LEVEL, STARTING_XP, requiredXPForLevel } from '@/features/profile/leveling';
import GlassPanel from '@/components/ui/GlassPanel';
import GradientButton from '@/components/ui/GradientButton';
import styles from './AuthScreen.module.css';

type Mode = 'sign-in' | 'sign-up';

const ERROR_TEXT: Record<AuthError, string> = {
  'username-too-short': `ไอดีต้องมีอย่างน้อย ${USERNAME_MIN_LENGTH} ตัวอักษร`,
  'username-too-long': `ไอดียาวได้ไม่เกิน ${USERNAME_MAX_LENGTH} ตัวอักษร`,
  'username-invalid-chars': 'ใช้ได้เฉพาะตัวอักษร ตัวเลข และ . _ - เท่านั้น (ห้ามเว้นวรรค)',
  'username-taken': 'ไอดีนี้ถูกใช้แล้วในเครื่องนี้',
  'username-reserved': 'ไอดีนี้ถูกสงวนไว้',
  'password-too-short': `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`,
  'password-too-long': 'รหัสผ่านยาวเกินไป',
  'password-mismatch': 'รหัสผ่านสองช่องไม่ตรงกัน',
  'account-not-found': 'ไม่พบไอดีนี้ในเครื่องนี้ ลองสร้างไอดีใหม่',
  'wrong-password': 'รหัสผ่านไม่ถูกต้อง',
  'admin-code-required': 'ไอดีนี้เป็นไอดีแอดมิน ต้องกรอกรหัสแอดมิน',
  'admin-code-wrong': 'รหัสแอดมินไม่ถูกต้อง',
  'crypto-unavailable':
    'เบราว์เซอร์นี้เข้ารหัสรหัสผ่านไม่ได้ ต้องเปิดผ่าน https หรือ localhost เท่านั้น',
  'storage-unavailable': 'เบราว์เซอร์บล็อกการบันทึกข้อมูล ลองปิดโหมดไม่ระบุตัวตน',
};

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-up');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const signingUp = mode === 'sign-up';
  const needsAdminCode = signingUp && isAdminUsername(username);

  const ready = signingUp
    ? !checkUsername(username) &&
      !checkPassword(password) &&
      password === confirmPassword &&
      (!needsAdminCode || adminCode.trim().length > 0)
    : username.trim().length > 0 && password.length > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirmPassword('');
    setAdminCode('');
  }

  function clearError() {
    if (error) setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;

    setBusy(true);
    const result = signingUp
      ? await signUp({ username, password, confirmPassword, adminCode })
      : await signIn(username, password);

    // On success the provider flips status and this screen unmounts.
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen}>
      <GlassPanel edged className={styles.panel}>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={signingUp}
            className={`${styles.tab} ${signingUp ? styles.tabActive : ''}`}
            onClick={() => switchMode('sign-up')}
          >
            สร้างไอดี
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!signingUp}
            className={`${styles.tab} ${!signingUp ? styles.tabActive : ''}`}
            onClick={() => switchMode('sign-in')}
          >
            เข้าสู่ระบบ
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <h1 className={styles.title}>{signingUp ? 'สร้างไอดีใหม่' : 'ยินดีต้อนรับกลับ'}</h1>
          <p className={styles.intro}>
            {signingUp
              ? 'ไอดีนี้ใช้ทั้งเข้าสู่ระบบและแสดงบนโปรไฟล์'
              : 'กรอกไอดีและรหัสผ่านที่เคยสร้างไว้ในเครื่องนี้'}
          </p>

          <label className={styles.field} htmlFor="auth-username">
            <span className={styles.labelRow}>
              <span className={styles.label}>ไอดี</span>
              {signingUp && (
                <span className={styles.counter}>
                  {nameLength(username)}/{USERNAME_MAX_LENGTH}
                </span>
              )}
            </span>
            <input
              id="auth-username"
              className={`${styles.input} ${error?.startsWith('username') || error === 'account-not-found' ? styles.inputInvalid : ''}`}
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                clearError();
              }}
              placeholder="เช่น Numero10"
              autoComplete="username"
              autoFocus
              spellCheck={false}
            />
          </label>

          <label className={styles.field} htmlFor="auth-password">
            <span className={styles.labelRow}>
              <span className={styles.label}>รหัสผ่าน</span>
            </span>
            <input
              id="auth-password"
              type="password"
              className={`${styles.input} ${error?.startsWith('password') || error === 'wrong-password' ? styles.inputInvalid : ''}`}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearError();
              }}
              placeholder={signingUp ? `อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร` : '••••••••'}
              autoComplete={signingUp ? 'new-password' : 'current-password'}
            />
          </label>

          {signingUp && (
            <label className={styles.field} htmlFor="auth-confirm">
              <span className={styles.labelRow}>
                <span className={styles.label}>ยืนยันรหัสผ่าน</span>
              </span>
              <input
                id="auth-confirm"
                type="password"
                className={`${styles.input} ${error === 'password-mismatch' ? styles.inputInvalid : ''}`}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearError();
                }}
                placeholder="พิมพ์อีกครั้ง"
                autoComplete="new-password"
              />
            </label>
          )}

          {needsAdminCode && (
            <div className={styles.adminField}>
              <p className={styles.adminNote}>
                ไอดีนี้อยู่ในรายชื่อแอดมิน ต้องกรอกรหัสแอดมินเพื่อสร้าง
              </p>
              <label className={styles.field} htmlFor="auth-admin-code">
                <span className={styles.labelRow}>
                  <span className={styles.label}>รหัสแอดมิน</span>
                </span>
                <input
                  id="auth-admin-code"
                  type="password"
                  className={`${styles.input} ${error?.startsWith('admin') ? styles.inputInvalid : ''}`}
                  value={adminCode}
                  onChange={(event) => {
                    setAdminCode(event.target.value);
                    clearError();
                  }}
                  placeholder="รหัสแอดมิน"
                  autoComplete="off"
                />
              </label>
            </div>
          )}

          <p className={styles.message} role="status">
            {error ? (
              ERROR_TEXT[error]
            ) : (
              <span className={styles.hint}>
                {signingUp
                  ? `ไอดี ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} ตัวอักษร ไทยหรืออังกฤษก็ได้`
                  : 'ไอดีถูกเก็บไว้ในเบราว์เซอร์นี้เท่านั้น'}
              </span>
            )}
          </p>

          {signingUp && (
            <div className={styles.start}>
              <span className={styles.startBadge}>{STARTING_LEVEL}</span>
              <span className={styles.startText}>
                เริ่มต้นที่เลเวล {STARTING_LEVEL} · {STARTING_XP}/
                {requiredXPForLevel(STARTING_LEVEL)} XP
              </span>
            </div>
          )}

          <GradientButton
            type="submit"
            fontSize={26}
            disabled={!ready || busy}
            className={`${styles.cta} ${ready && !busy ? '' : styles.ctaDisabled}`}
          >
            {busy ? 'กำลังดำเนินการ…' : signingUp ? 'สร้างไอดีและเริ่มเล่น' : 'เข้าสู่ระบบ'}
          </GradientButton>
        </form>
      </GlassPanel>
    </div>
  );
}
