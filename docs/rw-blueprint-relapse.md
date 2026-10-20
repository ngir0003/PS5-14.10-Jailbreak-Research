# R/W blueprint — Relapse's carrier, mapped onto our FontFace corruption

Source studied: references/relapse/mem.js, core.js (soniciso1, PS5 7.00–13.60).
Purpose: know exactly what corruption shape we must steer the FontFace
confused write toward, so no time is lost once the write widens.

## Relapse's construction, in three layers

1. **Carrier.** A corrupted JS typed-array view. Corruption gives
   control of the view's backing-store pointer; `aim(addr)` repoints it,
   `carrier.view[i]` reads/writes through it, `restore()` puts it back.
   Everything else is built on aim/read/restore:
   - `read1/2/4/8(addr)`, `write1/2/4/8(addr, val)` — mem.js:63–182
   - `readInto(dest, addr, count)` — windowed bulk copy
2. **addrof** = `leakval(obj)` (mem.js:184): drop the object into a
   known slot next to a known object, aim the carrier at that slot,
   read the 8-byte cell pointer. Sanity-checked (canonical low-48,
   8-aligned, nonzero).
3. **fakeobj** = the inverse: write a crafted cell pointer into an
   object-valued slot through the carrier, then read it as an object.

The carrier itself is FOUND, not built: core.js sprays candidate
objects with magic-marker bytes, validates geometry (u32At offsets,
butterfly-pair checks, `plausibleCell`/`plausibleAddress` gates,
read-twice-matches against GC movement) and only then trusts a
candidate. Failure markers ("addrof-no-result", "addrof-bogus-
geometry") tell the operator which stage died.

## What this means for the FontFace track

Our confused write today is one enum field on a C++ CSSFontFace
(WebCore heap). Relapse's carrier lives in the JSC heap. The bridge we
need — the ONLY thing standing between our current state and their
layer 1 — is a corruption that touches either:

  (a) a JSArrayBufferView's backing-store pointer (direct carrier), or
  (b) any JS object's butterfly/structureID (their found-not-built
      route: spray markers, validate, promote to carrier), or
  (c) a WebCore object's vtable → wrong-virtual-call with controlled
      arguments → pivot to (a)/(b).

p458's class-map tells us which allocations cohabit the freed slot's
size class; p459 aims that class at objects whose first qword is a
valid vtable but whose layout puts attacker data where the confused
call's argument or write lands (route c). WebCore objects with inline
buffers (e.g. strings, style data) are candidates.

## Hard rules learned from their code (carry into p459+)

- Never trust a candidate on one read: read-twice-matches guards
  against GC moving objects between validation and use (core.js:292).
- Validate pointer shape before use: low-48 canonical, aligned,
  nonzero (mem.js:184 implausible-cell check) — catches most
  mis-aims before they crash.
- Restore the carrier after every operation (aim/try/finally) — a
  carrier left aimed at attacker memory dies on the next GC or debug
  touch.
- Everything must survive with asserts compiled out: their code never
  relies on an exception that an assert would have thrown on debug
  builds — same environment we have on 14.10 (LLInt, no JIT, no
  Gigacage, StructureID unchecked).

## Status line

p458 (dense 8-byte sweep to 256) is running to identify the freed
slot's size class. The moment a killer size appears, the p459 target
list is: same-class WebCore objects with (1) valid vtable at offset 0,
(2) attacker-influenced bytes at the confused call's write/argument
offset. Spray → validate markers (Relapse-style) → census which class
survives the dispatch and leaves observable side effects.
