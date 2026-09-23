# public/models/players

โมเดลนักเตะแบบสมจริง (GLB) ของแมตช์สด 3 มิติ เสิร์ฟตรงจากโฟลเดอร์นี้ ไม่ผ่าน bundler
และจะถูกโหลด**เฉพาะตอนเข้าแมตช์ 3 มิติ**เท่านั้น ไม่โหลดตอนเปิดเกม

ตอนนี้โฟลเดอร์นี้**ยังไม่มีโมเดล** — เกมจะวาดนักเตะแบบ procedural (`Player3D`) เหมือนเดิม
และไม่มี error ใด ๆ พอวางไฟล์ถูกต้องลงมา นักเตะจะเปลี่ยนเป็นโมเดลเองโดยไม่ต้องแก้โค้ด

ไฟล์ที่ระบบมองหา (ตั้งค่าที่ `src/components/manager/match3d/players/playerAssets.ts` ที่เดียว):

```
public/models/players/player_v1.glb       โมเดล + skeleton (+ คลิปได้ถ้าอยู่ไฟล์เดียวกัน)
public/models/players/animations_v1.glb   คลิปแยกไฟล์ บน skeleton เดียวกัน (ไม่มีก็ได้)
public/models/players/animations_v1.json  metadata ของคลิป เช่นความยาวก้าว (ไม่มีก็ได้)
```

## ข้อกำหนดของโมเดล

- glTF 2.0 แบบ binary (`.glb`) · แกน Y ขึ้น · หันหน้าไป **+Z** · 1 หน่วย = 1 เมตร
- สูงประมาณ **1.80 ม.** · จุด origin อยู่บนพื้นระหว่างเท้า · bind pose เป็น A-pose
- ใบหน้าทั่วไป ห้ามเป็นหน้านักเตะจริง และต้องมีสิทธิ์ใช้งานในเว็บสาธารณะก่อน commit
- กระดูกที่ต้องมี: `Hips` `Head` และซ้าย/ขวาของ `UpperLeg` `LowerLeg` `Foot` `UpperArm` `ForeArm`
  (ชื่อแบบ Mixamo / Unreal / Blender ก็ใช้ได้ ระบบแปลงให้เอง)
- คลิปที่ต้องมี: `Idle` `Walk` `Run` · คลิปอื่นตาม `CLIP_REGISTRY` (Jog, Sprint, Pass, Shoot,
  Tackle, Receive, Celebrate, GK_Ready, GK_Dive_Left, GK_Dive_Right, GK_Catch) ไม่มีก็เล่นได้
- คลิปเดิน/วิ่งต้องเป็นแบบ in place (ไม่มี root motion) และลูปเริ่มที่เท้าซ้ายแตะพื้น

ถ้าไฟล์ไม่ผ่านข้อกำหนด เกมจะไม่ล่ม — จะเขียนเหตุผลใน console (`[players] ...`) แล้วใช้นักเตะ
procedural ต่อไป

## metadata ของคลิป (animations_v1.json)

ใส่ความยาวก้าวที่วัดจริงเพื่อไม่ให้เท้าไถลบนพื้น:

```json
{ "clips": { "WALK": { "strideMeters": 1.6 }, "RUN": { "strideMeters": 3.4 } } }
```

## เปลี่ยนเวอร์ชันโมเดล

วางไฟล์ใหม่เป็น `player_v2.glb` แล้วแก้ `version` กับชื่อไฟล์ใน `PLAYER_ASSET_MANIFEST`
ถ้าชื่อคลิปของศิลปินต่างจากค่าเริ่มต้น ใส่ใน `clipNames` ของ manifest ไม่ต้องแก้ส่วนอื่น
