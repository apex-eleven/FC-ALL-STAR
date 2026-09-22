import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { avatarSource } from '@/features/avatars/extraAvatars';
import {
  CHAT_MAX_LENGTH,
  sendChatMessage,
  watchChat,
  type ChatDraft,
  type ChatMessage,
} from '@/features/cloud/cloudChat';
import styles from './LiveChat.module.css';

export interface LiveChatProps {
  /** Who is typing: stamped onto every message this player sends. */
  sender: Omit<ChatDraft, 'text'>;
}

/** Pause between sends. UI only — the rule does not enforce it. */
const COOLDOWN_MS = 2000;

/** Within this many px of the bottom counts as "reading the latest". */
const STICK_THRESHOLD = 60;

export default function LiveChat({ sender }: LiveChatProps) {
  // undefined = loading, null = unavailable (offline mode or missing rule).
  const [messages, setMessages] = useState<ChatMessage[] | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastSent = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => watchChat(setMessages), []);

  // Follow new messages only if the player was already at the bottom, so scrolling
  // back to read something is not yanked away by the next line.
  useEffect(() => {
    const list = listRef.current;
    if (list && stick.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stick.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_THRESHOLD;
  };

  const available = messages !== null;
  const canSend = available && !sending && text.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    if (Date.now() - lastSent.current < COOLDOWN_MS) return;
    setSending(true);
    setFailed(false);
    const ok = await sendChatMessage({ ...sender, text });
    setSending(false);
    if (ok) {
      lastSent.current = Date.now();
      setText('');
      stick.current = true;
    } else {
      setFailed(true);
    }
  };

  return (
    <section className={styles.chat} aria-label="LIVE CHAT">
      <header className={styles.strip}>
        <span className={styles.liveDot} aria-hidden="true" />
        <h2 className={styles.heading}>LIVE CHAT</h2>
      </header>

      <div className={styles.list} ref={listRef} onScroll={onScroll} aria-live="polite">
        {messages === undefined && <p className={styles.empty}>กำลังโหลด…</p>}
        {messages === null && <p className={styles.empty}>ไลฟ์แชทใช้ได้เฉพาะโหมดออนไลน์</p>}
        {messages?.length === 0 && <p className={styles.empty}>ยังไม่มีข้อความ เริ่มคุยเลย!</p>}
        {messages?.map((message) => (
          <div
            key={message.id}
            className={`${styles.row} ${message.uid === sender.uid ? styles.rowMine : ''}`}
          >
            <img className={styles.avatar} src={avatarSource(message.avatarId)} alt="" />
            <div className={styles.body}>
              <div className={styles.meta}>
                <span className={styles.name}>{message.username}</span>
                <span className={styles.level}>Lv.{message.level}</span>
                <span className={styles.ovr}>
                  <span className={styles.ovrLabel}>OVR</span>
                  {message.ovr}
                </span>
              </div>
              <p className={styles.text}>{message.text}</p>
            </div>
          </div>
        ))}
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <input
          className={styles.input}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          disabled={!available}
          placeholder={failed ? 'ส่งไม่สำเร็จ ลองอีกครั้ง' : 'พิมพ์ข้อความ…'}
          onChange={(event) => setText(event.target.value)}
          aria-label="พิมพ์ข้อความ"
        />
        <button type="submit" className={styles.send} disabled={!canSend} aria-label="ส่ง">
          <Send size={24} strokeWidth={2.4} />
        </button>
      </form>
    </section>
  );
}
