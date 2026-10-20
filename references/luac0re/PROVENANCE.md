# Luac0re — provenance

Source: github.com/Gezine/Luac0re, cloned 2026-10-20 (post-v2.0 tree).
Study + candidate parallel entry for the PS5-14.10 chain. Not served.

What it is: mast1c0re variation (CTurt's PS2-emulator savedata bug)
using the Lua 5.3 interpreter embedded in ps2emu's main executable;
v2.0 adds a JIT-compiler exploit giving arbitrary native userland code
execution on the LATEST PS4/PS5 firmwares without a kernel exploit,
and bypasses the PS5 8.00+ AF_UNIX socket restriction.

Requirements on OUR console (14.10):
- Star Wars Racer Revenge (PS2 classic) — USA CUSA03474 / EU CUSA03492,
  disc or digital. Digital via PSN should still be purchasable.
- Boot the game once to create savedata, then merge/resign the exploit
  savedata per shahrilnet/remote_lua_loader SETUP.md (no factory reset,
  no old apps, no activation tricks).

Why we want it: native code exec in a REAL process on 14.10 = direct
syscall access -> kernel bug surface can be probed empirically (which
syscalls exist, which Sony-custom ones still leak/panic), instead of
blind. Fully parallel to the WebKit FontFace track; neither blocks
the other.
