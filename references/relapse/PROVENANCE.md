# Provenance

Cloned 2026-10-20 from https://github.com/soniciso1/relapse (public,
MIT-unspecified - see upstream for license) as a REFERENCE ONLY.

What it is: PS5 WebKit + kernel exploit chain ("Relapse"), firmware
7.00 - 13.60. Kernel stage = aio_multi_wait UAF. Does NOT run on 14.10.

Why we keep it: mem.js/core.js/exploit.js are a complete, working
blueprint for building addrof/fakeobj/RW in the PS5's LLInt-only
WebKit (structureID + butterfly geometry, no JIT) - the same
environment our CSSFontFace UAF (CVE-2026-43715) must be weaponized
in. Study, do not serve.
