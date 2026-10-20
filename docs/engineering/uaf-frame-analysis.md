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
