# FC ALL-STAR — โปรเจกต์ที่แก้แล้ว (พร้อมใช้)

## แก้อะไรมาให้บ้าง

1. **ลบไฟล์ตาย 4 ไฟล์ที่ทำให้ `npm run build` พัง** — ลบให้แล้วในชุดนี้
   ```
   src/components/auth/SignUpScreen.tsx  + .module.css   ระบบสมัครแบบเก่า ไม่มีใครเรียกใช้
   src/features/news/imageEncoding.ts                     ถูกแทนด้วย src/lib/imageEncoding.ts
   vite-plugins/players-catalogue.ts                      ถูกแทนด้วย repo-store.ts
   ```
   ตอนนี้ `tsc --noEmit` ผ่าน **0 error** และ `npm run build` ผ่าน

2. **`backup.ts`** — ข้ามคีย์เก่าที่ตายแล้วตอนเขียน `admin.json`
   (จาก 860 KB เหลือราว 56 KB) แต่ข้ามเฉพาะเมื่อคีย์ใหม่มีอยู่จริงในเบราว์เซอร์นั้น

3. **`artManifest.ts`** — เข้ารหัสชื่อไฟล์รูปการ์ด กันชื่อที่มีเว้นวรรค วงเล็บ
   สระ หรือ `#` `?` ทำให้ URL ขาด

4. **`src/features/players/README.md`** — แก้ชื่อปลั๊กอินที่อ้างถึงให้ตรงของจริง

## ⚠️ ไฟล์ใหญ่ที่ไม่ได้ใส่มา — ต้องก๊อปจากโปรเจกต์เดิม

zip นี้ตัดไฟล์สื่อขนาดใหญ่ออก (รวม 222 MB) เพราะเป็นไฟล์เดิมที่คุณมีอยู่แล้ว
และไม่ได้ถูกแก้อะไรเลย ก๊อปจากโปรเจกต์เก่ามาวางทับ 2 จุด:

```
จากเดิม  src/assets/video/walkout-flight.mp4      (22 MB)
จากเดิม  src/assets/video/walkout-stage.mp4       (77 MB)
จากเดิม  public/players/*.gif  *.webp             (126 MB · 80 ไฟล์)
```

**ไฟล์ข้อมูลอยู่ครบแล้ว** — `public/players/catalogue.json` (การ์ด 80 ใบ),
`manifest.json`, `public/config/admin.json`, และ `public/brand/*` ทั้งหมด

## เริ่มใช้

```
npm install
npm run dev
```

`node_modules` ไม่ได้ใส่มาเหมือนกัน (117 MB และควรลงใหม่ตามเครื่องอยู่แล้ว)

## หลังเปิดครั้งแรก

1. เข้าแอดมิน → สำรองข้อมูล → กด "บันทึกลงโปรเจกต์เดี๋ยวนี้" (ให้ admin.json เล็กลง)
2. คอมมิต `public/config/admin.json` กับ `public/players/catalogue.json` ขึ้น git
3. เก็บ "ไฟล์สำรองทั้งหมด" (ที่มีไอดีผู้เล่น) ไว้นอก repo — อย่าคอมมิต
