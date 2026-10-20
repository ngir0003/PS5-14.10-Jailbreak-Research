# Scene landscape — what works where (as of 2026-10-20)

Reconstructed from psdevwiki/ps5 (Vulnerabilities, rev 4592) + public
repos + scene reporting. Purpose: know exactly which entry/kernel/HV
surfaces are LIVE on 14.10 so our chain effort aims at real gaps.

## Gezine's reconstruction (the 14.10 debug-settings video)

Track record (all public, psdevwiki-credited):
- Y2JB author: userland ROP in the PS5 YouTube app via V8
  CVE-2021-38003 (TheHole leak). App 01.000.030 needs only FW >= 12.20
  and NO license. Wiki: "unpatched as of 13.40". github.com/Gezine/Y2JB
- sys_kqueueex ucred refcount-leak UAF: Gezine's OWN kernel discovery
  (2026-05-02) -> arbitrary kernel RW. Patched in FW 13.00.
- GPU-DMA SMAP bypass chained with BD-JB-EX (2026-05-03): writes
  kernel .data via GPU DMA. Wiki: "probably unpatchable".

So the 14.10 demo is almost certainly:
  Y2JB (or BD-JB-EX) userland  +  a NEW PRIVATE kernel bug
  +  GPU-DMA .data write  +  (the reportedly-still-live HV bug).
The private part is the kernel bug; everything else he has shipped.

## Unpatched surface relevant to 14.10

Entry (userland):
- Y2JB — unpatched as of 13.40; app version dodge means no license
  wall. PRIME candidate to test on OUR 14.10 console.
- BD-JB-EX (<= 12.70 per wiki — likely patched later)
- WebKit CSSFontFace UAF CVE-2026-43715 — ours, confirmed live on
  14.10 (p445 crash, p452+ groom/flip).

Kernel:
- exFAThax v2 — exFAT driver heap overflow, wiki ceiling "?<= 13.40?"
  (UNTESTED above). USB-triggered. Candidate for 14.10 kernel stage.
- sys_kqueueex (Gezine) — dead at 13.00
- sys_fsc2h_ctrl — dead at 11.00
- sys_netcontrol double fdrop — dead at 12.02
- aio_multi_delete double free — dead at 10.20
- aio_multi_wait UAF (Relapse's kernel stage) — what 14.10 patched
- umtx_shm CVE-2024-43102 — dead at 8.00

Primitives (not bugs, unpatchable):
- GPU DMA copy into kernel .data (SMAP bypass) — flatz, works 6.00+
- prefetch-side-channel kASLR defeat (Zen 2) — TheFloW/Rizzo 2025

HV: named Byepervisor/APIC bugs are patched per wiki, but scene
reporting (Oct 2026) says "HV bug lives" in 14.10 — likely an
unpublished HV bug, same status as Gezine's kernel bug: private.

## Implications for this repo

1. Our CVE-2026-43715 WebKit entry is one of TWO live 14.10 entries
   we know of; the other (Y2JB) is public code we can test as an
   alternate/backup entry — and as a kernel-probing platform once
   we have userland ROP (syscall access from a real process).
2. Wiki confirms our exploitation plan direction: on PS5 a WebKit
   bug gives .data RW -> usermode ROP (XOM blocks .text RW), which
   is exactly what our Stage 2 flip needs to reach.
3. The 14.10 kernel gap is the real frontier: exFAThax v2 ceiling is
   UNTESTED above 13.40 — a USB stick test on our console would
   settle whether a public kernel overflow still lives on 14.10.
