# exFAT kernel-bug USB probe

Purpose: test whether the PS5 exFAT driver (14.10) is still reachable
by the original exfathax malformed-filesystem trigger. psdevwiki lists
"exFAThax v2" as patched <= ?13.40? (question marks = ceiling untested);
no public v2 image or builder exists — this v1 image (chendo's PS4 9.00
artifact) is the only public trigger we have. If the v1 image still
does ANYTHING on 14.10 (crash, reboot, weird mount error) that is a
live kernel signal. Expected outcome, honestly: silent rejection —
Sony patched this trigger shape on PS4 at 9.03, 5 years ago.

exfathax-v1-ps4-900.img — source: github.com/ChendoChap/pOOBs4
sha256 a6af26b142e82f3186f45eb8e162375ed16b20208209fc7b4cb93ef6ca070458

## Write to a USB stick (erases the stick)

diskutil list                     # find the stick, e.g. /dev/disk4
diskutil unmountDisk /dev/disk4
sudo dd if=tools/exfat-test/exfathax-v1-ps4-900.img of=/dev/rdisk4 bs=1m
diskutil eject /dev/disk4

## Test procedure

1. PS5 parked somewhere harmless (NOT mid-exploit-loop; pause the p457
   page first by navigating away from User's Guide).
2. Insert stick. Watch console for: nothing (patched/silent),
   error dialog, crash, or spontaneous reboot.
3. Log the outcome + timestamp in results/exfat-test.md.

Risk note: this triggers kernel code on malformed metadata. Worst case
is a kernel panic -> reboot; internal-drive corruption is unlikely but
not impossible. The console has no irreplaceable data (research box).
