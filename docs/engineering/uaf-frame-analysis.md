# Single-frame dangling-this write — derived from vulnerable source

Source: WebKit @ a7e4fdb9545042aef190cd469efb633e442fb43c (parent of fix
5aedb82710ba578f) — the code that actually runs on PS5 WK-1400.
Fetched to /tmp/claude-501/ps5/wk-vuln/ (CSSFontFace.cpp/.h, FontFace.h).

## The mechanism (replaces the census-era "confused client dispatch" story)

CSSFontFace::setStatus(Success) [CSSFontFace.cpp:561-585 vuln]:

    iterateClients(m_clients, [&](client) {
        client.fontStateChanged(*this, m_status, newStatus);
    });                        // (A) FontFace wrapper resolves its promise
                               //     here -> thenable getter runs INSIDE (A)
    m_status = newStatus;      // (B) write through dangling `this`

(A) Our getter (FontFace.prototype.then) removes the victim style and
forces layout, which purges/rebuilds the font set and frees THIS
CSSFontFace T mid-function. Sprayed faces' backings (same class)
reoccupy the block.
(B) `m_status = Status::Success` (=3, enum order Pending/Loading/
TimedOut/Success/Failure) writes 4 bytes at offsetof(CSSFontFace,
m_status) into the reoccupant. No client notification, no promise —
exactly the p456 signature (status flipped, descriptors pristine,
promise pending).
(C) The frame keeps using the freed T: fontLoadTiming() reads enum
fields; Timer scheduling touches the timer region; back in
fontLoadEventOccurred, pump() walks m_sources and iterateClients walks
m_clients (WeakHashSet in freed memory) -> virtual fontLoaded dispatch
through garbage when the reoccupant is raw markers (p446 deaths).

## Numbers

- CSSFontFace layout (vuln header, member order): vptr+refcount+weak
  (0x18ish) / Variant properties (0x10) / RefPtr family (8) /
  Vector ranges (0x10) / feature settings / loadingBehavior /
  sizeAdjust / Vector sources (0x18) / WeakHashSet clients (~0x18) /
  WeakPtr wrapper (8) / capabilities / **m_status** / bitfields /
  enums / Timer m_timeoutTimer (~0x30-0x40).
  -> object ~0x90-0xC0 bytes; bmalloc class 192 or 224 (both inside
  p446's proven-claimable 96..1536 mix; small fillers 8..256 never
  claimed because 192/224 need volume or exact-class requests).
- Write: 4 bytes, value 3, at fixed offsetof(m_status) ≈ 0x78-0x90.

## What the write can hit (same-class reoccupants)

- another CSSFontFace backing -> observable flip (today's baseline)
- bmalloc butterfly / typed-array backing store (same heap, Gigacage
  off) -> the 3 lands at a chosen offset in JS-visible data:
  - pointer low half -> data pointer redirected to (hi|3): JS-readable
    heap oracle through the owning view
  - length/capacity field -> geometry change
- validation rule: reoccupant fields other than the write offset must
  be pristine (p456) — any probe reading sprayed objects must scan ALL
  fields, not just look for the flip.

## Next probe (p459-eng, deterministic — not a census)

After the free in the getter, spray JS double-arrays whose butterflies
are ~192/224 B, each element a distinct marker double. After the
trigger, read back every element of every array:
- one element changed -> the stale write landed in a butterfly at a
  MEASURED offset; we then align a target field (length or pointer
  half) to that offset by choosing array shape
- nothing changed -> JS-heap objects don't claim the block; fall back
  to WebCore same-class sprays (strings/vectors) with JS-readable
  contents as the oracle

## Ladder results (2026-10-20 night session) — the flip IS the write

Device evidence from p460-sprayladder (beacons in results/beacon-logs/):

| rung | getter sprays | result |
|---|---|---|
| p457 (historical) | 120 JS FontFaces | SURVIVES hundreds of runs, flips at attractor positions |
| p459 v1/v2 | 200 / 64 double-arrays | DIES, even with every element 0.0 (cfg0 baseline) |
| p460 P0 | nothing | DIES (freeze, watchdog never fires) |
| p460 P1 | 120 FontFaces (p457 recipe) | pending — console OOM'd mid-ladder (memory exhausted by the night's freeze/restart cycles; rerun after cold boot) |

**Mechanism resolved.** Constructing a FontFace allocates a fresh CSSFontFace —
the same bmalloc class as the freed T. One of them claims the freed block, so
the frame's post-free reads (sources Vector, clients WeakHashSet, Timer) all
land on a *valid live object*: the page survives, and the only visible effect
is that face's `status` flipping to `loaded` with descriptors pristine and
promise pending.

**That flip — recorded for weeks as an unexplained signal — is the dangling
`m_status = Status::Success` write landing in the reoccupying CSSFontFace's
own m_status field.** The primitive fires safely on demand; it has never been
aimed at anything other than another CSSFontFace.

Arrays can't rescue: with array data in the block, the frame's reads hit
un-healable bytes (all-zero elements still die — the lethal read is the
butterfly's nonzero length header at +0x00 or the object tail beyond the
butterfly). Unsprayed blocks die too (stale bytes).

## Exact member order (vulnerable tree, /tmp fetch of parent-of-fix)

From CSSFontFace.h, private members in declaration order:

    refcount | m_propertiesOrCSSConnection (Variant, 16B) | m_family (RefPtr, 8)
    | m_ranges (Vector, 16) | m_featureSettings (Vector?) | m_loadingBehavior (4)
    | m_sizeAdjust (4) | m_sources (Vector, 16) | m_clients (WeakHashSet)
    | m_wrapper (WeakPtr, 8) | m_fontSelectionCapabilities (~16)
    | m_status (enum) | bitfields + 4 enums | m_timeoutTimer (Timer, ~32-40B)

Total ≈ 0x98–0xC0 → bmalloc class 192/224. m_status sits late, immediately
before the bitfields and Timer. Status::Success = 3.

Key consequence of ORDER: the post-write reads the frame performs
(fontLoadTiming enums, Timer) live in the LAST ~0x30 bytes of the object, and
m_clients/m_wrapper just before m_status — all in the tail. A reoccupant
whose tail bytes are ZERO presents an empty WeakHashSet, an unscheduled
Timer, and default timing enums: plausibly safe to the frame, same as a
fresh CSSFontFace is.

## p461 — string canary: measure the write offset exactly

Weaponization needs offsetof(m_status) ON DEVICE. A WTF StringImpl is
bmalloc-backed (same heap as WebCore with Gigacage off) and its bytes are
JS-readable:

- 8-bit StringImpl: 16-byte header (refcount, length, hash, flags) + data
- 176 chars of U+0000 → 16 + 176 = 192 bytes → same class as CSSFontFace
- Header (nonzero) overlaps properties/family — NOT read by the frame in
  this path. Zero data covers sources/clients/wrapper/capabilities/status/
  bitfields/Timer: every post-write read sees "empty/idle".
- The m_status write (4 bytes, 03 00 00 00) lands in character data at
  char index (offsetof(m_status) − 16) → reading the string back from JS
  after the trigger yields a nonzero charCode at an index that IS the
  offset, to the byte.

Rungs: FontFace rescue control (expect survive+flip) → 8 strings → 64 → 256.
Survive + one altered string = the write caught at a measured offset with the
page alive and the object JS-readable — the strongest observation available
before aiming the write at a chosen structure.

Fork after p461: if strings survive but never claim (no alteration, ever),
the class-192 claim path is CSSFontFace-specific (JSC-side segregation), and
weaponization goes through the FontFace reoccupant itself: chain a SECOND
free — flip a sprayed face's status, then free IT from JS
(document.fonts.delete + GC) while the frame's Timer write window is open.
