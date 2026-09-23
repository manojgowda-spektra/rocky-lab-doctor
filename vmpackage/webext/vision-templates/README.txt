Vision templates — reference crops for steps that are pixels, not DOM
====================================================================

A few lab steps are not web controls: the native Windows file picker, and VS Code or the
desktop when the VM is viewed as an RDP canvas inside the browser. Those arrive as pixels
in a single <canvas>, so the DOM resolver cannot see them. For those steps only, Rocky
template-matches a stored reference crop.

Same contract as everywhere else: a match must reach NCC 0.90 and beat any distinct
runner-up by 0.06, or there is no glow and the learner gets an honest card.

STATUS — read this before relying on a vision step
--------------------------------------------------
manifest.json declares:

    win-filepicker-open   ->  win-filepicker-open.png

and that PNG IS NOT IN THIS PACKAGE. The loader treats a missing crop as "not captured
yet" and the step falls back to its instruction card, which is safe but means the step can
never glow. `node test/resolve-bundle.js` reports this as a warning rather than a failure
for exactly that reason.

Which bundles this affects:
  bundle/test-bundle.json  (16 steps, the demo)      no vision steps  - unaffected
  bundle/full-bundle.json  (28 steps, the full lab)  step t4-pickfiles - card only

How to capture the missing crop
-------------------------------
1. Open the real lab to the point where the Windows file picker is on screen, viewed the
   way a learner sees it (in the browser, over RDP, at the resolution the lab uses).
2. In the browser console on that page:
       window.LabPilotVision.captureCrop(surface, rect)
   where `surface` is the canvas element and `rect` is the Open button's pixel rect. It
   returns a PNG data URL.
3. Save it as win-filepicker-open.png in this folder.
4. Re-run: node test/resolve-bundle.js   (the warning must become an [ok])

Capture the crop at the SAME scaling the learner will see. The matcher tries 0.9, 1.0 and
1.1 to tolerate DPI and RDP scaling, but a crop taken at a very different size will not
match, and the honest failure is a card rather than a wrong glow.
