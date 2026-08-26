/* Rocky Copilot — the companion, drawn.
 * Ported from the Rocky companion canvas engine (source/rocky-prototype/web/attic/rocky.html)
 * so the character is identical across the product. Presentation only: it draws a robot and
 * picks a pose. NONE of the poses are chosen by a model — each one is driven by a fact the
 * anchor engine already established (resolved / ambiguous / absent / finished). Same doctrine
 * as everywhere else: the engine asserts, the face merely reflects.
 */
(function (root) {
  'use strict';

  // Poses map 1:1 onto resolver outcomes, so the character can never contradict the engine.
  const POSE = {
    point:     { w: 16, h: 34, tilt: 6,   glow: '#2ee6c8', bob: 5,  arm: -52 }, // resolved → glowing a control
    thinking:  { w: 15, h: 28, tilt: 4,   glow: '#a78bfa', bob: 4,  arm: -34 }, // searching the DOM
    concerned: { w: 16, h: 28, tilt: -12, glow: '#fbbf24', bob: 4,  arm: -30 }, // ambiguous / absent → honest card
    happy:     { w: 23, h: 20, tilt: 0,   glow: '#43e8ff', bob: 6,  arm: -12, arc: true },
    celebrate: { w: 24, h: 22, tilt: 0,   glow: '#5ef0a0', bob: 13, arm: -54, arc: true },
  };

  function makeCompanion(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, t = 0, last = performance.now();
    let pose = POSE.happy, poseName = 'happy';
    let pos = { x: 120, y: 120 }, target = { x: 120, y: 120 };
    let armAngle = -12, blink = 1, nextBlink = 2, blinkPhase = null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

    function rr(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath(); ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    function blade(px, py, rot) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(rot * Math.PI / 180);
      ctx.shadowColor = '#0006'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
      const g = ctx.createLinearGradient(-6, 0, 6, 70);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.55, '#e8eef8'); g.addColorStop(1, '#c2cee2');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(10, 22, 5, 64); ctx.quadraticCurveTo(2, 70, 0, 70);
      ctx.quadraticCurveTo(-2, 70, -5, 64); ctx.quadraticCurveTo(-10, 22, 0, -2);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    function eye(cx, cy, p, side) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((p.tilt * side) * Math.PI / 180);
      ctx.shadowColor = p.glow; ctx.shadowBlur = 16;
      const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, '#eaffff'); g.addColorStop(.42, p.glow); g.addColorStop(1, p.glow);
      ctx.fillStyle = g; ctx.strokeStyle = g; ctx.lineCap = 'round';
      if (p.arc) {
        ctx.lineWidth = Math.max(5, p.h * .5);
        ctx.beginPath(); ctx.moveTo(-p.w / 2, p.h * .22);
        ctx.quadraticCurveTo(0, -p.h * .6, p.w / 2, p.h * .22); ctx.stroke();
      } else {
        const ry = Math.max(1.4, (p.h * blink) / 2);
        ctx.beginPath(); ctx.ellipse(0, 0, p.w / 2, ry, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    function draw(cx, cy, scale) {
      const p = pose;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);

      // the gold halo — Rocky's signature, and a live confidence tell:
      // teal when resolved, amber when it cannot resolve. Colour comes from the pose.
      const halo = ctx.createRadialGradient(cx, cy, 20, cx, cy, 96);
      halo.addColorStop(0, p.glow + '00');
      halo.addColorStop(.55, p.glow + '2e');
      halo.addColorStop(1, p.glow + '00');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, 96, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,211,107,' + (0.45 + 0.2 * Math.sin(t * 3)) + ')';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 78, 0, 7); ctx.stroke();

      blade(cx - 38, cy + 12, 12);
      blade(cx + 38, cy + 12, armAngle);

      // body
      ctx.save(); ctx.shadowColor = '#0009'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 10;
      const byc = cy + 46, brx = 36, bry = 54;
      const bg = ctx.createLinearGradient(cx - brx, byc - bry, cx + brx, byc + bry);
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(.5, '#eef2fa'); bg.addColorStop(1, '#c4d0e2');
      ctx.fillStyle = bg; ctx.beginPath();
      ctx.moveTo(cx - brx, byc - 6);
      ctx.quadraticCurveTo(cx - brx, byc - bry, cx, byc - bry);
      ctx.quadraticCurveTo(cx + brx, byc - bry, cx + brx, byc - 6);
      ctx.quadraticCurveTo(cx + brx - 3, byc + bry - 12, cx, byc + bry);
      ctx.quadraticCurveTo(cx - brx + 3, byc + bry - 12, cx - brx, byc - 6);
      ctx.closePath(); ctx.fill(); ctx.restore();

      // chest core, pulsing in the pose colour
      const coreY = byc - 10, pulse = reduce ? .85 : .7 + .22 * Math.sin(t * 2.3);
      ctx.save();
      const cg = ctx.createRadialGradient(cx, coreY, 1, cx, coreY, 12);
      cg.addColorStop(0, '#ffffff'); cg.addColorStop(.35, p.glow); cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = pulse; ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, coreY, 12, 0, 7); ctx.fill(); ctx.restore();

      // head + visor
      const hyc = cy - 46, hrx = 42, hry = 36;
      ctx.save(); ctx.shadowColor = '#0009'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 7;
      const hg = ctx.createLinearGradient(cx, hyc - hry, cx, hyc + hry);
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(.55, '#eaf0f8'); hg.addColorStop(1, '#c8d3e4');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(cx, hyc, hrx, hry, 0, 0, 7); ctx.fill(); ctx.restore();

      ctx.save(); ctx.shadowColor = p.glow; ctx.shadowBlur = 16;
      const fw = 68, fh = 40, fyc = hyc + 2;
      const fg = ctx.createLinearGradient(cx, fyc - fh / 2, cx, fyc + fh / 2);
      fg.addColorStop(0, '#10192e'); fg.addColorStop(1, '#05080f');
      ctx.fillStyle = fg; rr(cx - fw / 2, fyc - fh / 2, fw, fh, fh / 2); ctx.fill(); ctx.restore();

      eye(cx - 13, fyc, p, 1);
      eye(cx + 13, fyc, p, -1);
      ctx.restore();
    }

    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
      if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
      ctx.clearRect(0, 0, W, H);

      if (!reduce) {
        nextBlink -= dt;
        if (nextBlink <= 0 && blinkPhase === null) { blinkPhase = 0.0001; nextBlink = 2 + Math.random() * 3; }
        if (blinkPhase !== null) {
          blinkPhase += dt / .13;
          if (blinkPhase >= 1) { blinkPhase = null; blink = 1; } else blink = Math.abs(Math.cos(blinkPhase * Math.PI));
        }
      }
      pos.x = damp(pos.x, target.x, 4.5, dt);
      pos.y = damp(pos.y, target.y, 4.5, dt);
      armAngle = damp(armAngle, pose.arm, 8, dt);

      const bob = reduce ? 0 : Math.sin(t * 2) * pose.bob * 0.35;
      draw(pos.x, pos.y + bob, 0.62);
      requestAnimationFrame(frame);
    }

    resize();
    requestAnimationFrame(frame);

    return {
      setPose(name) { if (POSE[name]) { pose = POSE[name]; poseName = name; } },
      getPose() { return poseName; },
      moveTo(x, y) { target.x = x; target.y = y; },
      jumpTo(x, y) { pos.x = target.x = x; pos.y = target.y = y; },
      get position() { return { x: pos.x, y: pos.y }; },
      resize,
    };
  }

  root.RockyRender = { makeCompanion, POSE };
})(typeof self !== 'undefined' ? self : this);
