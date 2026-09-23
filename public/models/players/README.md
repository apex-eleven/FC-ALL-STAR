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
public/models/players/T_Body_MaskA.png    มาสก์ชุดแข่ง (ต้องมีทั้ง A และ B ถึงจะใส่สีทีมได้)
public/models/players/T_Body_MaskB.png
public/models/players/T_Numbers.png       ตัวเลข 0–9 เรียงแถวเดียว สีขาวพื้นโปร่งใส (ไม่มีก็ได้)
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

## ชุดแข่งและรูปลักษณ์ (STEP 5)

สีทีม สีผิว ผม รองเท้า ถุงมือ แขนยาว เบอร์เสื้อ และส่วนสูง มาจาก `PlayerLook` ของนักเตะแต่ละคน
(`players/playerAppearance.ts` + `players/KitSystem.ts`) — โมเดลห้ามมีสีทีมฝังมาเอง
base color ของตัวโมเดลให้ทำเป็นโทนเทากลาง ๆ (มีรอยพับ/เงาได้) แล้วระบบจะคูณสีตามมาสก์

- `T_Body_MaskA` — R เสื้อ · G ขอบ (1.0 = คอ/ปลายแขน, 0.5 = ขอบถุงเท้า) · B กางเกง · A ถุงเท้า
- `T_Body_MaskB` — R ผิว · G รองเท้า (1.0 = ตัวรองเท้า, 0.5 = สีรอง) · B ช่วงแขนท่อนล่าง
  (เป็นผิว หรือเป็นแขนเสื้อถ้าเป็นผู้รักษาประตู) · A พื้นที่เบอร์ (1.0) / โลโก้ทีม (0.5)
- มาสก์เป็น data ไม่ใช่สี: บันทึกแบบ linear ค่าต้องเป็น 0 / 0.5 / 1.0 เป๊ะ ๆ (ระบบอ่านแบบ nearest)
- เบอร์เสื้อ: ใส่ `numberUvRect` ใน manifest = สี่เหลี่ยม UV ของพื้นที่เบอร์ `[u0, v0, u1, v1]`
- ทรงผมแยกเป็น mesh ชื่อ `Hair_Short` `Hair_Buzz` `Hair_Long` `Hair_Curly` · ถุงมือชื่อ `Gloves`
  (ระบบเลือกโชว์ทรงที่ตรงกับนักเตะ และโชว์ถุงมือเฉพาะผู้รักษาประตู)
- โลโก้ทีมห้ามเป็นตราสโมสรจริง

ถ้าไม่มีมาสก์ โมเดลจะใช้ material ของตัวเองไปก่อน (ไม่มีการเดามาสก์ขึ้นมาเอง)

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
