# CSSFontFace iterateClients UAF (CVE-2026-43715)

**Status:** CONFIRMED on device (2026-10-20, 4/4 runs). Unpatched in WK-1400 (PS5 14.10).
**CVE:** CVE-2026-43715
**Upstream:** Patched in commit `5aedb82710ba578f`.

## Bug

`iterateClients()` in CSSFontFace.cpp copies a WeakHashSet into a `Vector<Ref<Client>>` and then invokes a callback on each client in the vector. When `FontFace::fontStateChanged` runs as one of those callbacks, it resolves `m_loadedPromise`. The promise resolution path checks whether the result is a thenable -- if it has a `.then` property, the engine calls that getter synchronously.

An attacker places a getter on `FontFace.prototype.then` that removes a style element and forces a synchronous layout. This causes a client to be removed from the underlying WeakHashSet while the callback loop is still iterating over its snapshot. On the next iteration, the loop invokes a callback on the now-disconnected client -- a use-after-free.

## Trigger

```js
Object.defineProperty(FontFace.prototype, 'then', { get() {
    document.getElementById('victim-style').remove();
    document.body.offsetHeight; // force synchronous layout
}, configurable: true });

const face = new FontFace('test', 'url(font.ttf)');
document.fonts.add(face);
face.load();
```

Calling `face.load()` starts font loading. When the font finishes loading, the engine calls `setStatus`, which triggers `iterateClients`, which resolves the promise, which checks for a thenable, which invokes the attacker's `.then` getter.

## Call Chain

1. `face.load()` initiates font loading.
2. The font loads successfully. The engine calls `CSSFontFace::setStatus(Status::Success)` (CSSFontFace.cpp:571-628).
3. `setStatus` calls `iterateClients(callback)` (CSSFontFace.cpp:55-59).
4. The first client callback is `FontFace::fontStateChanged` (FontFace.cpp:332-356).
5. `fontStateChanged` resolves `m_loadedPromise` at line 344.
6. `DOMPromiseProxy::resolve()` calls `JSDOMPromiseDeferred::resolve()`, which enters JavaScript execution.
7. The JavaScript engine checks whether the resolved value is a thenable. It reads the `.then` getter, which runs the attacker's synchronous JavaScript.
8. The getter removes a style element and forces a layout update. This disconnects a client from the WeakHashSet.
9. The loop continues to the next client and invokes a callback on the now-disconnected object -- use-after-free.

## Fix (Upstream)

Commit `5aedb82710ba578f` adds a `clients.contains(client)` check before each callback invocation, skipping any client that was removed during iteration. The WK-1400 build on PS5 14.10 does not include this fix.

## UAF Targets

The disconnected client can be any of the following types. Each receives a different callback after disconnection:

1. **CSSFontSelector** -- receives `fontLoaded`, which calls `dispatchInvalidationCallbacks()`.
2. **CSSSegmentedFontFace** -- receives `fontStateChanged`, which clears `m_cache`.
3. **CSSFontFaceSet** -- receives `fontStateChanged`, which calls `decrementActiveCount()` and then `completedLoading()`.
4. **FontFace** -- resolves the JavaScript promise. This is the first client in iteration order and is the one that triggers the thenable getter.

## Exploitation Path

1. The UAF produces a controlled callback invocation on a disconnected CSSFontSelector or CSSSegmentedFontFace object.
2. Heap grooming replaces the freed object with attacker-controlled data in the same FastMalloc size class.
3. Gigacage is disabled on PS5, so all allocations (including ArrayBuffer backing stores) share the same heap.
4. If the attacker controls the replacement memory, a StructureID corruption leads to type confusion.
5. Type confusion yields `addrof` and `fakeobj` primitives, which provide arbitrary read/write.

## Source Locations (WK-1400)

- `CSSFontFace.cpp:55-59` — VULNERABLE `iterateClients` (no `contains()` check)
- `CSSFontFace.cpp:571-628` — `setStatus()` calls `iterateClients`
- `CSSFontFace.cpp:428-438` — `fontLoadEventOccurred` → `iterateClients`
- `FontFace.cpp:332-356` — `fontStateChanged` → resolves `m_loadedPromise`
- `DOMPromiseProxy.h:335-343` — `resolve()` iterates deferred promises
- `JSDOMPromiseDeferred.cpp:55-90` — `callFunction` → enters JSC

## PS5 Requirements

All required APIs have been confirmed available on PS5 14.10:

- **FontFace API:** Available (confirmed in V399).
- **Object.defineProperty on FontFace.prototype:** Available (standard JavaScript).
- **document.fonts:** Available (confirmed in prior FontFace tests).
- **Font loading from ArrayBuffer or data: URI:** Available.

## Device Test

Deployed as `fa-v445-fontface.html` (probe `p445-fontface-uaf.js`).

**Run 1 (2026-10-20, device):** getter reentry confirmed live. On the
`local(Helvetica)` rounds the `.then` getter executes synchronously inside
the client iteration loop (`V445-THEN-n` beacons fire before
`V445-LOADED-n`). No crash in 3 triggers. A victim style that merely *uses*
the family disconnects no client that iterates after the FontFace.
`local(Songti)`, `local(SCE-PS3 Rodin LATIN)`, `local(--default--)` and a
data: URI TTF all reject with NetworkError -- `local(Helvetica)` is the only
source that reaches `setStatus(Success)` on this firmware. Log:
`results/beacon-logs/v445-fontface-run1.txt`.

**Run 2 (v2, deployed):** cycles victim variants per client type --
`face-rule` (CSS-created @font-face for the same family), `use-rule`
(control), `canvas-lookup` (canvas measureText forces a CSSFontSelector
lookup + cache before load), `unicode-range` (CSSSegmentedFontFace path) --
with a fresh family name per round, then a fast stress phase that keeps
faces in the set so CSSFontFaceSet active counts carry state. Crash
signature: beacons stop after a `V445-THEN-n-<variant>`; the variant tag
names the client type that died.


## Device Confirmation (2026-10-20)

Crash confirmed, 4/4 deterministic runs, probe v445f. The upstream
regression-test conditions are required: a CSS-created face (from an
@font-face rule, enumerated from document.fonts — FontFaceSet is Set-like,
enumerate with forEach/iterator, NOT Array.prototype.slice), local(Helvetica)
source, a separate victim stylesheet, and touching face.loaded before load().
Sequence on device: LOAD-0 -> THEN-1 (getter inside iterateClients) -> VR-1
(victim removed + layout forced) -> process death before the load promise
resolves. new FontFace() faces never crash (v1-v3, 235 clean triggers) —
the CSSFontSelector client only attaches to CSS-created faces
(CSSFontFace.cpp:100). Log: results/beacon-logs/v445-fontface-run4-crash.txt.

## Stage 2 — groom, survival, and the live type-confusion hook (2026-10-20)

### The groom recipe (p448/p450)

Inside the `then` getter, synchronously on top of the freed client slot:
1. remove the victim `<style>`, force layout (`document.body.offsetHeight`) — the free
2. spray 120 x ( `@font-face` style element + text-sink div + `offsetHeight` per item )

One allocation per free-list pop: LIFO serves the freed block to the first
same-class allocation, and per-item forced layout is mandatory (p447's single
batched layout at the end always died — 7/7). Raw ArrayBuffer marker bytes can
never survive the confused virtual dispatch (p446, 18/18 deaths): offset 0 of
the replacement must be a valid vtable. Failing-src spray (`local(Songti)`,
p450/p451) is the most stable variant — 4/4 rounds per page, no DOM-growth
degradation across rounds.

### What the freed slot actually is

The freed victim client is the JS `FontFace` wrapper (created when
`document.fonts` enumeration wraps the CSS-created face). The spray lands a
fresh `FontFace` wrapper on the slot, so the confused
`client.fontLoaded(*this)` (CSSFontFace.cpp, `fontLoadEventOccurred`) is a
same-class dispatch: it sets the wrong wrapper's status and resolves its
`loaded` promise.

### Observed on device (p451/p452)

- p451 census: the flip lands on ONE sprayed face per run — 18/25 runs, and
  only ever position near the head of the spray, never random.
- p452 live hook: `.loaded.then` attached to all 120 sprayed faces after the
  trigger. **28/28 runs (100%) exactly one promise fires** — `t1x30` x24,
  `t1x34` x2, `t1x37` x2 — always `Sloaded`. The landing slot jitters by a
  few spray positions (heap-layout run-to-run variance) but the flip itself
  is fully reliable in this build.
- CORRECTION (p453, 9+ runs): the flip itself is silent in C++ — the
  getter is hit exactly once. p452's `THEN-2` was the promise-assimilation
  thenable check firing when `hook()` attached `.then` to the already
  resolved flipped promise — a microtask artifact, NOT re-entry inside the
  confused dispatch. Still useful: at attach time `this` inside the getter
  IS the flipped wrapper, so the artifact identifies the confused-callback
  target from JS (p454 uses this deliberately).

### p453/p454 — second-order escalation

p453 (9+ runs): freeing at getter-hit-2 never fired (hits stays 1) — this is
what falsified the in-dispatch re-entry reading. Census still shows exactly
one flipped face (`CEN1-U119L1`), confirming the silent flip.

p454: drive the free from the assimilation artifact — attach `.loaded.then`
to every sprayed face after the trigger; the one attach that fires the getter
identifies the flipped wrapper (`this`). Take its family name only (a held JS
ref pins the C++ FontFace and blocks the free), remove its style + force
layout, re-spray, then re-enumerate `document.fonts` and read statuses: a
dangling set entry would be a JS-reachable UAF read. Longer term, the aim
remains steering the slot contents at a different CSSFontFaceClient subclass
(`FontFace::fontLoaded` vs `CSSFontSelector::fontLoaded` differ wildly; the
callback argument is the trigger CSSFontFace we control) for addrof/fakeobj.

### Client census (source-read, 2026-10-20 late)

CSSFontFaceClient subclasses and registration sites:
- `CSSFontFaceSet` — `add()` does `face.addClient(*this)` (one per
  document's font set: singleton, not sprayable)
- `CSSFontSelector` — `create()` does `result->addClient(fontSelector)`
  (one per document: singleton, not sprayable)
- `FontFace` wrapper — the only mass-producible client; what our spray
  allocates and what the confused dispatch lands on today

Conclusion: aiming the slot at a *different client class* via spray is
not possible — there is no other sprayable subclass. The exploitation
path is data-aiming: put a wrapper with attacker-controlled internals
(JS-constructed `new FontFace()` with chosen descriptors, or a
wrapper-over-controlled-backing) in the slot and study the confused
`fontLoaded(triggerFace)` against it. The trigger face (the callback
argument) is already fully attacker-chosen.

### p455/p456 — data-aiming achieved, footprint mapped (2026-10-20 night 2)

- p455 (3/3): JS-constructed `new FontFace()` wrappers take the freed
  slot; one flips to `loaded`. Data-aiming works — the confused dispatch
  lands on an attacker-owned object with chosen descriptors.
- p456 (3/3, J57 stable): flipped face has `status=loaded`, every other
  descriptor pristine, `loaded` promise pending, and `load()` never
  settles (control rejects NetworkError).
- Source-grounded (FontFace.cpp `fontStateChanged`): the legit Success
  path ALWAYS resolves m_loadedPromise. J57's pending promise proves the
  confused call wrote the backing's status field directly, bypassing
  pump/fontStateChanged entirely — a state unreachable via the API.

### Next direction (p457+)

The confused call's write is narrow: one status enum field on the
backing of the wrapper that lands in the slot. Aiming DATA got us this
far; to widen the write, the next lever is SIZE: mismatch the freed
victim's allocation size against the spray so the confused client
pointer lands *offset into* a larger sprayed object (classic heap
shaping — vary victim construction vs spray object size and census for
a flip landing anywhere other than a pristine wrapper). Keep
FontFace.cpp/CSSFontFace.cpp (fetched to /tmp/claude-501/ps5/wk/) at
hand; FontFace::adopt (removeClient/addClient pair) is also worth
studying as a re-registration primitive.

## p458 — heap class-map of the freed slot (2026-10-20 night 3)

Infrastructure upgrade first: host.py now captures every /BEACON probe
into results/beacon-logs/beacons.jsonl (structured, ts-tagged); tally
with `python3 tools/beacon-stats.py [prefix] [--dist]`. The 457 census
loop graduated into p458 (fa-v458-classmap.html).

Design. p446's key negative result — raw ArrayBuffer marker bytes at
the slot kill the dispatch 18/18 — is also a positive fact: a
size-matched ArrayBuffer backing store CAN claim the freed wrapper
slot (shared FastMalloc class). So the wrapper's allocation class is
directly measurable from JS: per run, insert exactly ONE filler
`new ArrayBuffer(k)` between the free and the face spray (LIFO free
list: the first same-class allocation takes the block). k cycles over
[0,16,24,32,40,48,56,64,72,80,96,112,128] via localStorage so a crash
round doesn't lose the schedule when the page is re-parked.

Readout per k:
- flips survive -> k outside the wrapper class (filler went elsewhere)
- page dies (last beacon = K<k>-GO) -> k is IN the class: killer size
  identifies the FontFace wrapper's FastMalloc size class exactly

k=0 rounds are the p457 baseline and keep feeding the flip-position
distribution. One crash is expected per killer size; re-park resumes
past it automatically.

Why the class matters: once the wrapper's class is known, the next
step (p459) sprays same-class WebCore objects with VALID vtables but
different identities — the confused `fontLoaded` virtual call then
dispatches through the wrong vtable index into a different class's
virtual method with our pointers as arguments. That is the road to a
wider primitive than the one-enum write, and it needs no address leak
to take the first step (a valid vtable is present by construction).
