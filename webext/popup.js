fetch(chrome.runtime.getURL('steps/foundry.json')).then(r=>r.json()).then(b=>{
  document.getElementById('b').textContent = b.portal || b.bundle;
  document.getElementById('s').textContent = b.steps.length;
}).catch(()=>{ document.getElementById('b').textContent='not loaded'; });
