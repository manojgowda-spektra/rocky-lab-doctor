/*
 * Rocky — the LabPilot companion (content-script build).
 *
 * Rocky is the FACE of LabPilot: a friendly robot (gold halo, amber eyes, white teardrop body,
 * little wing-arms) who flies next to the exact control the engine resolved, POINTS a wing at
 * it, and speaks the step in a bubble. The precise glow (overlay.js) marks the target; Rocky
 * points at it. Presentation only.
 *
 * HONESTY: Rocky's MOOD is derived only from deterministic facts (did the step resolve, is the
 * control non-actionable, is the lab complete) — NEVER from any model narrating itself. Mood is
 * shown by his HALO tint (gold = guiding, amber = non-actionable, purple = searching,
 * green = complete). The guidance TEXT is the authored bundle text, rendered unmodified.
 *
 * LEARN (the lab guide teaches, not just points): each step may carry an authored
 * `learn` block — WHY this step matters, WHAT the technology/control is, and an optional
 * TIP. Rocky shows WHY under the instruction and offers "What is this?" to expand WHAT/TIP.
 * Same honesty rule: authored bundle text only, rendered verbatim, no model in the loop.
 *
 * window.LabPilotRocky:
 *   guide(el, text, meta, onArrive) — fly beside el, point, then reveal + say text
 *                                     meta.learn = {why, what, tip} (optional)
 *   checking(title)   — searching mood
 *   celebrate(msg)    — celebrate + confetti
 *   hide()
 *   setLearn(on) / toggleLearn() / expandLearn(bool) — learn panel visibility (sticky)
 *   explore(on) / exploring — EXPLORE mode (cyan halo, no step guidance; see explore.js)
 *   explain(el, text, opts)  — fly to el and describe it (opts: label, mood, ai, onAskAI, hint)
 *   announce(text, opts)     — speak in place (mode changes)
 *   rect()                   — Rocky's screen box (for menus)
 * Clicking Rocky's body dispatches a `labpilot-rocky-click` event on document (menu lives in
 * explore.js). Only his OPAQUE pixels are clickable — the transparent box stays click-through.
 */
(function () {
  "use strict";
  if (window.LabPilotRocky) return;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // halo tint per mood (eyes stay amber — that's Rocky's identity)
  var MOODS = {
    neutral:  { halo: "#ffcf5a", eye: "oval", bob: 4,  point: false },
    point:    { halo: "#ffcf5a", eye: "oval", bob: 5,  point: true  },
    happy:    { halo: "#ffdd7a", eye: "arc",  bob: 6,  point: false },
    think:    { halo: "#a78bfa", eye: "oval", bob: 3,  point: false },
    concerned:{ halo: "#ff9a3c", eye: "oval", bob: 3,  point: false, tilt: -8 },
    celebrate:{ halo: "#5ef0a0", eye: "arc",  bob: 11, point: false },
    explore:  { halo: "#7df9ff", eye: "oval", bob: 4,  point: true  },   // watching, not guiding
  };
  var EYE = "#f7c23a", EYE_HI = "#fff3c4";

  // SIZE. The character is DRAWN on a 150x172 grid (every coordinate below assumes it), but
  // displayed at SCALE of that. 150px beside a portal control is overbearing, and worse on
  // a lab VM at a lower resolution. Change this one number to resize him; the bubble
  // placement and edge-clamping read W and H, so they follow automatically.
  var SCALE = 0.62;
  var ART_W = 150, ART_H = 172;                       // the drawing grid, do not change
  var W = Math.round(ART_W * SCALE), H = Math.round(ART_H * SCALE);

  var host = document.createElement("div");
  host.id = "labpilot-rocky"; host.setAttribute("data-labpilot", "1");
  host.style.cssText = "position:fixed;z-index:2147483644;width:" + W + "px;height:" + H + "px;pointer-events:none;" +
    "opacity:0;transition:opacity .3s;";  // motion is the JS easing in loop(); a CSS left/top transition on top of it made him lag (retargeted every frame)
  var cv = document.createElement("canvas");
  cv.width = ART_W * 2; cv.height = ART_H * 2;        // 2x backing store keeps him crisp
  cv.style.cssText = "width:" + W + "px;height:" + H + "px";
  var ctx = cv.getContext("2d"); ctx.scale(2, 2);
  host.appendChild(cv);
  var bub = document.createElement("div");
  bub.setAttribute("data-labpilot", "1");
  bub.style.cssText = "position:fixed;z-index:2147483645;max-width:320px;background:#0d1426f2;color:#eef2ff;" +
    "border:1px solid rgba(140,160,255,.4);border-radius:14px;padding:10px 13px;font:600 13.5px/1.4 'Segoe UI',system-ui,sans-serif;" +
    "box-shadow:0 12px 34px rgba(0,0,0,.5);opacity:0;transition:opacity .3s;pointer-events:none;";
  (document.body || document.documentElement).appendChild(host);
  (document.body || document.documentElement).appendChild(bub);

  var state = { mood: "neutral", glow: "#ffcf5a", targetGlow: "#ffcf5a",
                x: window.innerWidth - (W + 20), y: window.innerHeight - (H + 48),
                tx: window.innerWidth - (W + 20), ty: window.innerHeight - (H + 48),
                blink: 1, nextBlink: 2, visible: false, pointDir: 1, t: 0, pending: null, arriveBy: 0, exploring: false };

  function hx(c){ c=String(c||""); if(c[0]==="#"){var n=parseInt(c.slice(1),16);return[n>>16,(n>>8)&255,n&255];}
    var m=/rgba?\(([^)]+)\)/.exec(c); if(m){var p=m[1].split(",").map(Number);return[p[0]||0,p[1]||0,p[2]||0];} return [255,207,90]; }   // hex OR rgb() — the halo blend feeds rgb() back in
  function mix(a,b,m){var x=hx(a),y=hx(b);return"rgb("+Math.round(x[0]+(y[0]-x[0])*m)+","+Math.round(x[1]+(y[1]-x[1])*m)+","+Math.round(x[2]+(y[2]-x[2])*m)+")";}
  function rgba(c,a){ if(c[0]==="#"){var p=hx(c);return"rgba("+p[0]+","+p[1]+","+p[2]+","+a+")";} return c.replace("rgb(","rgba(").replace(")",","+a+")"); }
  function rr(x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

  function wing(cx, shy, sideSign, mood){
    ctx.save(); ctx.translate(cx + sideSign*24, shy);
    var pointing = MOODS[mood].point && state.pointDir === sideSign;
    var ang = pointing ? sideSign*0.22 : sideSign*0.95;      // point outward vs rest down
    var len = pointing ? 46 : 34;
    if (pointing && !reduce) ang += sideSign*Math.sin(state.t*3)*0.05;
    ctx.rotate(ang);
    ctx.fillStyle = "#eef1f7";
    ctx.beginPath(); ctx.ellipse(sideSign*len*0.5, 0, len*0.5, 9, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawRocky(halo, mood){
    ctx.clearRect(0,0,150,172);
    var cx=75, t=state.t, bob=reduce?0:Math.sin(t*2)*(MOODS[mood].bob||4);
    var hy=56+bob, tilt=(MOODS[mood].tilt||0)*Math.PI/180;
    // ground shadow
    ctx.save();ctx.globalAlpha=.2;ctx.fillStyle="#000";ctx.beginPath();ctx.ellipse(cx,162,30,6,0,0,7);ctx.fill();ctx.restore();
    // warm halo behind head
    var pulse=reduce?.9:.72+.2*Math.sin(t*2.2);
    ctx.save();ctx.globalAlpha=pulse;
    var hg=ctx.createRadialGradient(cx,hy,6,cx,hy,58);
    hg.addColorStop(0,rgba(halo,.95));hg.addColorStop(.5,rgba(halo,.55));hg.addColorStop(1,rgba(halo,0));
    ctx.fillStyle=hg;ctx.fillRect(cx-70,hy-70,140,140);ctx.restore();
    // body (teardrop)
    var by=hy+34;
    ctx.save();ctx.shadowColor="#0007";ctx.shadowBlur=12;ctx.shadowOffsetY=6;
    ctx.fillStyle="#f7f9fc";
    ctx.beginPath();
    ctx.moveTo(cx,by);
    ctx.bezierCurveTo(cx-34,by+6, cx-32,by+70, cx,by+78);
    ctx.bezierCurveTo(cx+32,by+70, cx+34,by+6, cx,by);
    ctx.closePath();ctx.fill();ctx.restore();
    // wings (behind/at body sides)
    wing(cx, by+16, -1, mood);
    wing(cx, by+16,  1, mood);
    // head
    ctx.save();ctx.translate(cx,hy);ctx.rotate(tilt);ctx.shadowColor="#0007";ctx.shadowBlur=14;ctx.shadowOffsetY=5;
    ctx.fillStyle="#f7f9fc"; rr(-40,-30,80,60,26); ctx.fill(); ctx.restore();
    // visor
    ctx.save();ctx.translate(cx,hy);ctx.rotate(tilt);
    ctx.fillStyle="#0c1224"; rr(-33,-19,66,38,19); ctx.fill();
    // eyes (amber, with glow + highlight); blink squashes oval
    var eye=MOODS[mood].eye, bl=state.blink;
    ctx.shadowColor=EYE; ctx.shadowBlur=12; ctx.fillStyle=EYE; ctx.strokeStyle=EYE; ctx.lineWidth=5; ctx.lineCap="round";
    for(var s=-1;s<=1;s+=2){ var ex=s*15;
      if(eye==="arc"){ ctx.beginPath();ctx.moveTo(ex-9,3);ctx.quadraticCurveTo(ex,-9,ex+9,3);ctx.stroke(); }
      else { var ry=Math.max(1.6,11*bl); ctx.beginPath();ctx.ellipse(ex,0,7,ry,0,0,7);ctx.fill();
        if(bl>.5){ ctx.save();ctx.shadowBlur=0;ctx.fillStyle=EYE_HI;ctx.beginPath();ctx.ellipse(ex-2.4,-ry*.38,2.2,ry*.28,0,0,7);ctx.fill();ctx.restore(); } }
    }
    ctx.restore();
  }

  function reposition(rect){
    var margin=16, rw=W, rh=H;
    var right = rect.right + margin + rw < window.innerWidth;
    state.pointDir = right ? -1 : 1;
    state.tx = right ? rect.right + margin : Math.max(8, rect.left - margin - rw);
    state.ty = Math.max(8, Math.min(window.innerHeight - rh - 8, rect.top + rect.height/2 - rh*0.42));
    positionBubble();
  }
  function positionBubble(){
    var bw = bub.offsetWidth||220, bh = bub.offsetHeight||48;
    var bx = Math.max(8, Math.min(window.innerWidth - bw - 8, state.x + 75 - bw/2));
    var above = state.y - 8, below = window.innerHeight - (state.y + H) - 8, by;
    if (bh <= above) by = state.y - bh - 6;                 // preferred: above his head
    else if (bh <= below) by = state.y + H + 8;           // else below his feet
    else {                                                  // tall LEARN bubble: beside him, on the side AWAY from the target
      bx = state.pointDir === -1 ? state.x + W + 8 : state.x - bw - 8;
      if (bx < 8 || bx + bw > window.innerWidth - 8) bx = state.pointDir === -1 ? state.x - bw - 8 : state.x + W + 8;
      bx = Math.max(8, Math.min(window.innerWidth - bw - 8, bx));
      by = state.y + 86 - bh/2;
    }
    by = Math.max(8, Math.min(window.innerHeight - bh - 8, by));
    bub.style.left = bx + "px"; bub.style.top = by + "px";
  }

  function show(){ if(!state.visible){ state.visible=true; host.style.opacity=1; } }
  function place(){ host.style.left=state.x+"px"; host.style.top=state.y+"px"; }
  function setMood(m){ state.mood = MOODS[m]?m:"neutral"; state.targetGlow = MOODS[state.mood].halo; }

  // ---- learn panel state (sticky across steps; a learner who expands once keeps it open) ----
  var learn = { on: true, expanded: false, last: null };
  function learnRow(label, body){
    var row=document.createElement("div"); row.style.cssText="display:flex;gap:8px;align-items:flex-start;margin-top:6px";
    var lb=document.createElement("span"); lb.textContent=label;
    lb.style.cssText="flex:none;font:800 10px 'Segoe UI',system-ui,sans-serif;letter-spacing:1.2px;color:#ffcf5a;padding-top:3px;min-width:34px";
    var tx=document.createElement("span"); tx.textContent=body;
    tx.style.cssText="font:500 12.5px/1.45 'Segoe UI',system-ui,sans-serif;color:#c7cfea";
    row.appendChild(lb); row.appendChild(tx); return row;
  }
  function learnPanel(L){
    if(!learn.on || !L || !(L.why||L.what||L.tip)) return null;
    var box=document.createElement("div");
    box.style.cssText="margin-top:9px;padding-top:8px;border-top:1px solid rgba(140,160,255,.25)";
    if(L.why) box.appendChild(learnRow("WHY", L.why));
    if(L.what||L.tip){
      var b=document.createElement("button"); b.type="button";
      b.textContent = learn.expanded ? "Hide  \u25B4" : "What is this?  \u25BE";
      b.style.cssText="margin-top:7px;pointer-events:auto;cursor:pointer;background:#1b2340;color:#cdd6ff;border:1px solid rgba(140,160,255,.35);border-radius:6px;padding:3px 9px;font:600 11.5px 'Segoe UI',system-ui,sans-serif";
      b.addEventListener("click",function(e){ e.preventDefault(); e.stopPropagation(); learn.expanded=!learn.expanded; resay(); });
      if(learn.expanded){
        if(L.what) box.appendChild(learnRow("WHAT", L.what));
        if(L.tip)  box.appendChild(learnRow("TIP",  L.tip));
      }
      box.appendChild(b);
    }
    return box;
  }
  function resay(){ if(learn.last) say(learn.last.text, learn.last.copy, learn.last.learn, learn.last.extra); }

  // ---- ask-box guard -------------------------------------------------------------------
  // The bubble is rebuilt on every re-evaluation (the portal mutates constantly), which used
  // to destroy a half-typed question. While an ask box is open we hold routine guidance in a
  // queue instead of re-rendering, and we carry the typed text + caret across the deliberate
  // rebuilds (asking, the answer arriving, a follow-up).
  var ask = { open:false, value:"", caret:null, focused:false, queued:null };
  function askClose(){
    if(!ask.open) return;
    ask.open=false; ask.value=""; ask.caret=null; ask.focused=false;
    var q=ask.queued; ask.queued=null;
    if(q) say(q.text, q.copy, q.learn, q.extra);
  }

  function say(text, copyText, L, extra){
    var wantsAsk = !!(extra && extra.ask);
    // `demand` marks something the learner explicitly asked for by clicking. Those must
    // always render: deferring them made the AI-settings gear look broken whenever the Ask
    // box happened to be open, which is exactly when a learner reaches for it.
    var demanded = !!(extra && (extra.demand || extra.form));
    if(ask.open && !wantsAsk && !demanded){         // typing in progress: don't tear the box down
      ask.queued = { text:text, copy:copyText, learn:L, extra:extra };
      if(text) learn.last = ask.queued;             // keep state honest for Learn toggles
      return;
    }
    if(demanded){ ask.open=false; ask.queued=null; }   // the new panel replaces the box
    if(!text){ bub.style.opacity=0; learn.last=null; ask.open=false; ask.value=""; return; }
    learn.last = { text:text, copy:copyText, learn:L, extra:extra };
    bub.innerHTML="";
    if(extra && extra.label){ var hd=document.createElement("div"); hd.textContent=extra.label;
      hd.style.cssText="font:800 10px 'Segoe UI',system-ui,sans-serif;letter-spacing:1.4px;color:"+(extra.mood==="concerned"?"#ff9a3c":"#7df9ff")+";margin-bottom:4px"; bub.appendChild(hd); }
    var tx=document.createElement("div"); tx.textContent=text; bub.appendChild(tx);
    if(extra && extra.ai){ var ai=document.createElement("div"); ai.style.cssText="margin-top:8px;padding-top:7px;border-top:1px solid rgba(140,160,255,.25);font:500 12.5px/1.45 'Segoe UI',system-ui,sans-serif;color:#9ff0e0";
      var al=document.createElement("span"); al.textContent="AI · "; al.style.cssText="font-weight:800;font-size:10px;letter-spacing:1.2px;color:#a78bfa"; ai.appendChild(al);
      var at=document.createElement("span"); at.textContent=extra.ai; ai.appendChild(at); bub.appendChild(ai); }
    if(extra && extra.onAskAI && !extra.ai){ var ab=document.createElement("button"); ab.type="button"; ab.textContent="Ask AI \u25B8";
      ab.style.cssText="margin-top:8px;pointer-events:auto;cursor:pointer;background:#2a2150;color:#d9ccff;border:1px solid rgba(167,139,250,.5);border-radius:6px;padding:3px 9px;font:600 11.5px 'Segoe UI',system-ui,sans-serif";
      ab.addEventListener("click",function(e){ e.preventDefault(); e.stopPropagation(); try{ extra.onAskAI(); }catch(x){} }); bub.appendChild(ab); }
    if(extra && extra.ask){   // free-text question box (Ask Rocky); the answer comes back via extra.onAsk(question)
      var row=document.createElement("form"); row.style.cssText="margin-top:9px;display:flex;gap:6px;align-items:center;pointer-events:auto";
      var inp=document.createElement("input"); inp.type="text"; inp.placeholder=extra.ask.placeholder||"Ask Rocky anything about this lab…"; inp.setAttribute("data-labpilot","1");
      inp.autocomplete="off"; inp.spellcheck=false; inp.value=ask.value||"";
      inp.style.cssText="flex:1;min-width:0;background:#0b0f1e;color:#eef2ff;border:1px solid rgba(140,160,255,.4);border-radius:8px;padding:6px 9px;font:500 12.5px 'Segoe UI',system-ui,sans-serif;outline:none;pointer-events:auto";
      var go=document.createElement("button"); go.type="submit"; go.textContent=extra.ask.busy?"…":"Ask"; go.disabled=!!extra.ask.busy;
      go.style.cssText="flex:none;pointer-events:auto;cursor:pointer;background:#6d7cff;color:#fff;border:0;border-radius:8px;padding:6px 12px;font:600 12px 'Segoe UI',system-ui,sans-serif";
      // Submitting the question. A <form> submit handler alone is not enough: every key here
      // is stopPropagation'd so the portal underneath never sees the learner typing, and in
      // several portals the implicit "Enter submits a form" never reaches this form at all —
      // the learner types a question, presses Enter, and nothing happens, with the Ask button
      // still working. Fire the same path explicitly on Enter so both routes behave the same.
      function submitAsk(){
        var q=inp.value.trim(); if(!q) return;
        ask.value=""; ask.caret=null;
        try{ extra.ask.onAsk(q); }catch(x){}
      }
      row.addEventListener("submit",function(e){ e.preventDefault(); e.stopPropagation(); submitAsk(); });

      // the portal must not see these keys, and Escape closes the box
      ["keydown","keyup","keypress","input","beforeinput","paste","cut"].forEach(function(t){
        inp.addEventListener(t,function(e){ e.stopPropagation();
          if(t==="keydown" && e.key==="Escape"){ e.preventDefault(); askClose(); return; }
          if(t==="keydown" && (e.key==="Enter" || e.keyCode===13) && !e.shiftKey){
            e.preventDefault(); submitAsk(); return;
          }
          ask.value=inp.value; ask.caret=inp.selectionStart; });
      });
      ["mousedown","pointerdown","click","focus"].forEach(function(t){
        inp.addEventListener(t,function(e){ e.stopPropagation(); ask.focused=true; });
      });
      inp.addEventListener("blur",function(){ ask.focused=false; });
      row.appendChild(inp); row.appendChild(go); bub.appendChild(row);
      ask.open=true;
      if(extra.ask.focus!==false || ask.focused){
        setTimeout(function(){ try{ inp.focus();
          if(ask.caret!=null && inp.setSelectionRange) inp.setSelectionRange(ask.caret, ask.caret);
        }catch(x){} },30);
      }
    }
    if(extra && extra.form){          // inline settings: label + input rows, then one button
      var F=extra.form, vals={}, rows=document.createElement("div");
      rows.style.cssText="margin-top:9px;display:flex;flex-direction:column;gap:6px;pointer-events:auto";
      F.fields.forEach(function(f){
        vals[f.key]=f.value||"";
        var lb=document.createElement("div"); lb.textContent=f.label;
        lb.style.cssText="font:600 10px 'Segoe UI',system-ui,sans-serif;letter-spacing:.8px;color:#7f8bb5;text-transform:uppercase";
        var ip=document.createElement("input"); ip.type=f.password?"password":"text";
        ip.value=f.value||""; ip.placeholder=f.placeholder||""; ip.setAttribute("data-labpilot","1");
        ip.autocomplete="off"; ip.spellcheck=false;
        ip.style.cssText="width:100%;box-sizing:border-box;background:#0b0f1e;color:#eef2ff;border:1px solid rgba(140,160,255,.4);"+
          "border-radius:7px;padding:5px 8px;font:500 11.5px 'Segoe UI',system-ui,sans-serif;outline:none;pointer-events:auto";
        // the portal must never see these keystrokes
        ["keydown","keyup","keypress","input","paste","cut","mousedown","click","focus"].forEach(function(t){
          ip.addEventListener(t,function(e){ e.stopPropagation(); vals[f.key]=ip.value;
            if(t==="keydown"&&e.key==="Escape"){ e.preventDefault(); bub.style.opacity=0; } });
        });
        rows.appendChild(lb); rows.appendChild(ip);
      });
      var st2=document.createElement("div");
      st2.style.cssText="font:500 11px 'Segoe UI',system-ui,sans-serif;color:#9ff0e0;min-height:14px";
      var bt=document.createElement("button"); bt.type="button"; bt.textContent=F.save||"Save";
      bt.style.cssText="margin-top:2px;pointer-events:auto;cursor:pointer;background:#6d7cff;color:#fff;border:0;"+
        "border-radius:8px;padding:6px 12px;font:600 12px 'Segoe UI',system-ui,sans-serif";
      bt.addEventListener("click",function(e){ e.preventDefault(); e.stopPropagation();
        try{ F.onSave(vals,function(msg){ st2.textContent=msg; }); }catch(x){ st2.textContent=String(x&&x.message||x); } });
      rows.appendChild(bt); rows.appendChild(st2); bub.appendChild(rows);
    }
    if(extra && extra.hint){ var hn=document.createElement("div"); hn.textContent=extra.hint; hn.style.cssText="margin-top:7px;font:500 10.5px 'Segoe UI',system-ui,sans-serif;color:#6f7ba3"; bub.appendChild(hn); }
    if(copyText){
      var row=document.createElement("div"); row.style.cssText="margin-top:8px;display:flex;gap:8px;align-items:center";
      var code=document.createElement("code"); code.textContent=copyText;
      code.style.cssText="flex:1;min-width:0;overflow:auto;white-space:nowrap;background:#0b0f1e;color:#9ff0e0;padding:4px 7px;border-radius:6px;font:12px 'Consolas',ui-monospace,monospace;pointer-events:none";
      var b=document.createElement("button"); b.type="button"; b.textContent="Copy";
      b.style.cssText="flex:none;pointer-events:auto;cursor:pointer;background:#6d7cff;color:#fff;border:0;border-radius:6px;padding:4px 11px;font:600 12px 'Segoe UI',system-ui,sans-serif";
      b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();
        function ok(){b.textContent="Copied ✓";setTimeout(function(){b.textContent="Copy";},1500);}
        if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(copyText).then(ok,ok);}
        else{var ta=document.createElement("textarea");ta.value=copyText;document.body.appendChild(ta);ta.select();try{document.execCommand("copy");ok();}catch(_){}ta.remove();}});
      row.appendChild(code);row.appendChild(b);bub.appendChild(row);
    }
    var lp=learnPanel(L); if(lp) bub.appendChild(lp);
    bub.style.opacity=1; positionBubble();
  }

  var API = {
    guide:function(el, text, meta, onArrive){
      var r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      setMood(meta && meta.variant==="notice" ? "concerned" : "point");
      if(r){ reposition(r); }
      show(); if(!ask.open) bub.style.opacity=0;                       // an open ask box stays put while he flies
      state.pending = { text: text, copy: meta && meta.copyText, learn: meta && meta.learn, onArrive: (typeof onArrive==="function"?onArrive:null) };
      state.arriveBy = performance.now() + 1000;
    },
    checking:function(title){ setMood("think"); show(); say(title||"One sec — finding this step…"); },
    celebrate:function(msg){ setMood("celebrate"); state.tx=window.innerWidth/2-75; state.ty=window.innerHeight/2-30; show(); say(msg||"Lab complete! 🎉"); confetti(); },
    happy:function(text){ setMood("happy"); show(); say(text); },
    hide:function(){ askClose(); ask.queued=null; state.visible=false; host.style.opacity=0; bub.style.opacity=0; },
    explore:function(on){ if(!on) askClose(); state.exploring=!!on; setMood(on?"explore":"neutral"); if(on){ show(); } },
    get exploring(){ return state.exploring; },
    rect:function(){ return host.getBoundingClientRect(); },
    dimBubble:function(on){ bub.style.opacity = on ? 0 : (learn.last ? 1 : 0); },              // ring open → bubble steps aside
    react:function(on){ setMood(on ? "happy" : (state.exploring ? "explore" : "point")); },   // he smiles while you choose
    dismissAnnounce:function(){ if(learn.last && learn.last.extra && learn.last.extra.ask){ bub.style.opacity=0; learn.last=null; ask.open=false; ask.value=""; ask.caret=null; ask.queued=null;
      try{ if(window.LabPilotOverlay && window.LabPilotOverlay.refresh) window.LabPilotOverlay.refresh(); }catch(e){}
      try{ var sp=document.createElement("span"); sp.style.display="none"; document.body.appendChild(sp); setTimeout(function(){ sp.remove(); },30); }catch(e){} } },
    announce:function(text, opts){ opts=opts||{}; setMood(opts.mood||(state.exploring?"explore":"neutral")); show(); state.pending=null; say(text, null, null, opts); },
    explain:function(el, text, opts){
      opts=opts||{}; opts.demand=true;   // the learner pointed at this; never defer it
      var r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      setMood(opts.mood||"explore"); if(r) reposition(r); show(); bub.style.opacity=0;
      state.pending={ text:text, copy:null, learn:null, extra:opts, onArrive:null }; state.arriveBy=performance.now()+1000;
    },
    setLearn:function(on){ learn.on=!!on; resay(); return learn.on; },
    toggleLearn:function(){ learn.on=!learn.on; resay(); return learn.on; },
    expandLearn:function(v){ learn.expanded = (v==null) ? !learn.expanded : !!v; resay(); return learn.expanded; },
    get learnOn(){ return learn.on; },
  };
  window.LabPilotRocky = API;

  function confetti(){
    if(reduce) return;
    var c=document.createElement("canvas"); c.setAttribute("data-labpilot","1");
    c.style.cssText="position:fixed;inset:0;z-index:2147483643;pointer-events:none";
    c.width=innerWidth; c.height=innerHeight; (document.body||document.documentElement).appendChild(c);
    var g=c.getContext("2d"), cols=["#ffcf5a","#ffdd7a","#5ef0a0","#7df9ff","#6d7cff","#fff"];
    var ox=window.innerWidth/2, oy=window.innerHeight/2, P=[];
    for(var i=0;i<260;i++)P.push({x:ox+(Math.random()-.5)*80,y:oy,w:7+Math.random()*7,h:9+Math.random()*11,vx:(Math.random()-.5)*15,vy:-8-Math.random()*11,g:.24+Math.random()*.2,rot:Math.random()*6.28,vr:-.35+Math.random()*.7,c:cols[i%cols.length]});
    var t0=Date.now();
    (function f(){var el=Date.now()-t0;g.clearRect(0,0,c.width,c.height);for(var i=0;i<P.length;i++){var p=P[i];p.vy+=p.g;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;g.save();g.translate(p.x,p.y);g.rotate(p.rot);g.fillStyle=p.c;g.fillRect(-p.w/2,-p.h/2,p.w,p.h);g.restore();}
      if(el<5000)requestAnimationFrame(f); else c.remove();})();
  }

  // ---- Rocky is clickable on his OPAQUE pixels only (the box stays click-through) ----------
  function hitRocky(clientX, clientY){
    if(!state.visible) return false;
    var r=host.getBoundingClientRect(); if(r.width<1||clientX<r.left||clientX>r.right||clientY<r.top||clientY>r.bottom) return false;
    var opaque=true;
    try { var px=ctx.getImageData(Math.floor((clientX-r.left)*2), Math.floor((clientY-r.top)*2), 1, 1).data; opaque = px[3] > 40; } catch(e){}
    if(!opaque) return false;
    // never steal a click from a page control underneath him (the host is pointer-events:none, so
    // elementFromPoint returns the page element); the control bar's Explore button is the fallback
    try { var under=document.elementFromPoint(clientX, clientY);
      if(under && under.closest && under.closest("button,a[href],input,select,textarea,summary,[contenteditable],[role=button],[role=link],[role=menuitem],[role=tab],[role=option],[role=checkbox],[role=switch],[role=radio],[role=combobox],[role=slider]")) return false; } catch(e){}
    return true;
  }
  document.addEventListener("click", function(e){
    if(!hitRocky(e.clientX, e.clientY)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    document.dispatchEvent(new CustomEvent("labpilot-rocky-click", { detail: { x:e.clientX, y:e.clientY } }));
  }, true);
  var cursorOn=false;
  document.addEventListener("mousemove", function(e){
    var on = hitRocky(e.clientX, e.clientY);
    if(on!==cursorOn){ cursorOn=on; document.documentElement.style.cursor = on ? "pointer" : ""; }
  }, { passive:true, capture:true });

  var last=performance.now();
  function loop(now){
    var dt=Math.min(.05,(now-last)/1000); last=now; state.t+=dt;
    state.x += (state.tx-state.x)*(1-Math.exp(-9*dt));
    state.y += (state.ty-state.y)*(1-Math.exp(-9*dt));
    state.glow = mix(state.glow, state.targetGlow, 1-Math.exp(-6*dt));
    if(!reduce){ state.nextBlink-=dt; if(state.nextBlink<=0){ state.blink=Math.max(.05,state.blink-dt/0.06); if(state.blink<=.06){state.blink=1;state.nextBlink=1.8+Math.random()*3;} } }
    if(state.pending){
      var d=Math.abs(state.x-state.tx)+Math.abs(state.y-state.ty);
      if(d<6 || now>state.arriveBy){ var p=state.pending; state.pending=null; say(p.text,p.copy,p.learn,p.extra); if(p.onArrive){ try{p.onArrive();}catch(e){} } }
    }
    if(state.visible){ place(); positionBubble(); drawRocky(state.glow, state.mood); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  addEventListener("resize", function(){ if(state.visible) positionBubble(); });
})();
