#!/bin/bash
# Copy probe entry pages and their JS into this directory so host.py can
# serve them. The probes live under ../../probes/; host.py only serves files
# inside this folder.
set -e
cd "$(dirname "$0")"

cp ../../probes/fontface-uaf/p445-fontface-uaf.js .
cp ../../probes/metadata-overflow/extraction/p162-deep-scan.js .
cp ../../probes/fontface-uaf/p446-groom-survive.js .

echo "[*] Deployed:"
ls -la fa-*.html index.html p445-fontface-uaf.js p162-deep-scan.js
