# Y2JB — provenance

Source: github.com/Gezine/Y2JB (Gezine), tag 1.6, cloned 2026-10-20.
Study + potential test-bed reference for the PS5-14.10 chain. Not served
by the remote loader.

What it is: userland code execution in the PS5 YouTube app (Cobalt/V8,
CVE-2021-38003 TheHole leak). Entry is firmware-independent (the bug
lives in the app, not the OS) — psdevwiki: "unpatched as of 13.40",
ceiling above that untested (14.10 is ours to test).

Contents of note:
- download0/cache/splash_screen/.../  — the exploit page bundle the app
  loads from its own cache (kernel.js = post-exploit kread/kwrite via
  known kernel bugs; kexp_2026_05_25.bin = ufm42/kexp all-in-one kernel
  shellcode; elfldr-ps5-1360.elf = 13.60 ELF loader). The KERNEL stage
  here is for <=13.60 bugs and will NOT survive 14.10 — we only want
  the ENTRY (userland ROP in Cobalt) as a syscall-probing platform.
- payload_sender.py / log_server.py — host-side tooling (JS payloads to
  port 50000, ELF payloads to 9021).

Non-jailbroken install path (README): restore the pre-made USB backup
Y2JB_backup_1.6.12.20.zip (499 MB, release asset) — WARNING: PS5 backup
restore FACTORY RESETS the console. Whether 14.10 still accepts this
backup is itself an open question.
