/**
 * หน้าประกาศปิดระบบถาวร — ย้ายไปเซิร์ฟเวอร์ใหม่
 *
 * แสดงแทนทุกหน้าของเกม (ยกเว้น /admin) ตั้งแต่ระดับ App.tsx เลย
 * เพื่อไม่ให้ผู้เล่นเข้าเกมเก่าได้อีก โดยไม่ต้องรอเช็ก Firebase/บัญชีก่อน
 *
 * แก้ลิงก์เกมใหม่ / Discord ได้ที่ NEW_GAME_URL และ DISCORD_URL ด้านล่าง
 */
const NEW_GAME_URL = 'https://fc-all-star.vercel.app/';
const DISCORD_URL = 'https://discord.gg/pXHXg3psk6';

export const ShutdownNoticePage = () => (
  <div className="stadium-bg flex min-h-screen items-center justify-center p-4">
    <div className="w-full max-w-lg">
      <div className="glass-panel relative overflow-hidden p-8 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(70% 50% at 50% 0%, rgba(49,224,109,0.16), transparent 65%)',
          }}
          aria-hidden
        />

        <div className="relative">
          <p className="eyebrow justify-center text-gold/80">ประกาศสำคัญ</p>

          <h1 className="mt-2 font-display text-3xl uppercase leading-tight">
            FC <span className="text-neon">ALLSTAR</span>
          </h1>

          <p className="mt-4 font-display text-xl uppercase tracking-wide text-chalk/95">
            ปิดระบบถาวร
          </p>

          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-chalk/65">
            เซิร์ฟเวอร์นี้ย้ายระบบไปเกมใหม่แล้ว และ<span className="text-chalk/90">ปิดให้บริการอย่างถาวร</span>
            {' '}ผู้เล่นจะไม่สามารถเข้าเล่นเกมนี้ต่อได้อีก
            <br className="hidden sm:block" />
            ขอบคุณทุกท่านที่ร่วมเดินทางไปด้วยกันมาตลอด — ไปต่อกันที่เกมใหม่ได้เลย
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href={NEW_GAME_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex-1 rounded-lg bg-neon px-5 py-3 text-sm font-bold uppercase tracking-wider text-ink-900 transition-transform hover:scale-[1.02] active:scale-95 sm:flex-none"
            >
              ไปเล่นเกมใหม่ →
            </a>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold uppercase tracking-wider text-chalk/90 transition-transform hover:scale-[1.02] hover:border-white/25 active:scale-95 sm:flex-none"
            >
              เข้าร่วม Discord
            </a>
          </div>

          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-chalk/30">
            ข้อมูล/ความคืบหน้าในเซิร์ฟเวอร์นี้จะไม่ถูกย้ายไปให้อัตโนมัติ
          </p>
        </div>
      </div>
    </div>
  </div>
);
