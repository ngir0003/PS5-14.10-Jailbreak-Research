# Vulnerable WebKit sources (for derivation work)

Fetched from the WebKit tree at commit a7e4fdb9545042aef190cd469efb633e442fb43c
(parent of the CVE-2026-43715 fix 5aedb82710ba578f). iterateClients has NO
contains() guard in this tree — verify before use. NOTE: CSSFontFace is
allocated from a DEDICATED bmalloc heap (DEFINE_ALLOCATOR_WITH_HEAP_IDENTIFIER)
— only CSSFontFace allocations can claim a freed CSSFontFace block; JS-side
objects (arrays, strings, buffers) never will, which explains every silent
claimant experiment (p458, p459, p462).
