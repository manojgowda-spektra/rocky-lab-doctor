/*
 * LabPilot vision template loader + capture helper (surface:"vision").
 *
 * Reference crops for vision steps are shipped as web-accessible PNGs and decoded to
 * ImageData once on startup, then handed to LabPilotVision.registerTemplate(). Until a
 * crop is registered a vision step shows its instruction card (safe). This file also
 * exposes a CAPTURE helper used during authoring over an RDP-in-browser desktop: given a
 * pixel surface and a rect, it returns a PNG data URL of that crop so the operator can save
 * it as a new template (that is how the file-picker / VS Code crops are harvested from the
 * CloudLabs RDP canvas — the desktop is pixels in the page, so DOM/UIA aren't available
 * from outside the VM and template-matching is the applicable engine).
 *
 * manifest.json shape (webext/vision-templates/manifest.json):
 *   { "templates": [ { "id": "win-filepicker-open", "file": "win-filepicker-open.png",
 *                      "threshold": 0.9 } ] }
 */
(function () {
  "use strict";
  var V = window.LabPilotVision;
  if (!V) return;

  // Decode an <img>/blob URL to ImageData via an offscreen canvas.
  function imageDataFromUrl(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        try {
          var c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, c.width, c.height));
        } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // Load every template listed in the manifest and register it. Resolves with the count.
  // Best-effort: a missing/broken crop is skipped (its step just stays on the card).
  V.loadTemplates = function (manifestUrl, baseUrl) {
    return fetch(manifestUrl)
      .then(function (r) { return r.json(); })
      .then(function (m) {
        var list = (m && m.templates) || [];
        return Promise.all(list.map(function (t) {
          var url = (baseUrl || "") + t.file;
          return imageDataFromUrl(url)
            .then(function (imgData) { V.registerTemplate(t.id, imgData); if (t.threshold != null) V.setThreshold && V.setThreshold(t.id, t.threshold); return 1; })
            .catch(function () { return 0; });
        })).then(function (counts) { return counts.reduce(function (a, b) { return a + b; }, 0); });
      })
      .catch(function () { return 0; });
  };

  // Convenience for the extension: load from the packaged vision-templates/ dir.
  V.loadPackagedTemplates = function () {
    if (typeof chrome === "undefined" || !chrome.runtime) return Promise.resolve(0);
    var base = chrome.runtime.getURL("vision-templates/");
    return V.loadTemplates(base + "manifest.json", base);
  };

  // ---- AUTHORING capture helper (run via console/javascript_tool during capture) --------
  // Crop a rect (in the surface's own PIXEL coordinates) out of a pixel surface and return
  // a PNG data URL. The operator reads target coords from a screenshot, calls this, saves
  // the PNG as vision-templates/<id>.png, and adds it to manifest.json.
  V.captureCrop = function (surface, x, y, w, h) {
    surface = surface || V.findPixelSurface();
    if (!surface) return null;
    try {
      var pxW = surface.naturalWidth || surface.videoWidth || surface.width;
      var pxH = surface.naturalHeight || surface.videoHeight || surface.height;
      var full = document.createElement("canvas");
      full.width = pxW; full.height = pxH;
      full.getContext("2d").drawImage(surface, 0, 0, pxW, pxH);
      var crop = document.createElement("canvas");
      crop.width = w; crop.height = h;
      crop.getContext("2d").drawImage(full, x, y, w, h, 0, 0, w, h);
      return { dataUrl: crop.toDataURL("image/png"), surfacePx: [pxW, pxH],
               surfaceCss: surface.getBoundingClientRect() };
    } catch (e) { return { error: String(e) }; }
  };

  // Report the on-page pixel surface(s) so the operator can confirm the RDP canvas.
  V.describeSurfaces = function () {
    return [].slice.call(document.querySelectorAll("canvas,video,img")).map(function (e) {
      var r = e.getBoundingClientRect();
      return { tag: e.tagName, w: Math.round(r.width), h: Math.round(r.height),
               px: [e.naturalWidth || e.videoWidth || e.width, e.naturalHeight || e.videoHeight || e.height],
               id: e.id || null, cls: (e.className || "").toString().slice(0, 40) };
    }).filter(function (s) { return s.w > 100 && s.h > 80; });
  };
})();
