/*
 * LabPilot Foundry knowledge base — what the controls of the Microsoft Foundry portal ARE and
 * DO, for Rocky's EXPLORE mode ("what is this button?"). Authored text, matched
 * deterministically on the control's accessible name (and optionally the route). Rendered
 * verbatim. When nothing matches, Rocky falls back to an honest description built from the
 * control's ROLE + LABEL + STATE — he never invents a purpose. Also holds the DANGER rules:
 * controls whose click destroys or changes something the lab depends on.
 *
 * window.LabPilotKB:
 *   describe(el)            -> {el, role, name, tag, state[], context, href, disabled}
 *   lookup(desc, route)     -> entry | null
 *   explain(desc, opts)     -> text  (opts.steps = bundle steps for "this is step N" cross-ref)
 *   danger(desc)            -> {label, why} | null
 *   interesting(el)         -> bool  (worth explaining at all)
 */
(function () {
  "use strict";
  if (window.LabPilotKB) return;

  // ---- entries: m = accessible-name regex; route = optional pathname regex --------------
  var KB = [
    // left navigation (project)
    { m: /^overview$/i, what: "the project's front page.", does: "It shows the project's endpoints, keys, connected resources and recent activity; you come back here to copy an endpoint or check quota." },
    { m: /^model catalog$/i, what: "the catalog of models you can deploy: well over a thousand from Microsoft, OpenAI, Meta, Mistral, Cohere, Hugging Face and more.", does: "Each card lists provider, capabilities, context window, regions and pricing. Deploying from here creates a callable endpoint in your project." },
    { m: /^playgrounds?$/i, what: "no-code test benches for your deployments: chat, images, audio, agents, completions.", does: "You try prompts and parameters against a live deployment before writing any code; 'View code' then gives you the equivalent API call." },
    { m: /^agents?$/i, what: "where you build AI agents: a model plus instructions, tools (functions, search, code interpreter) and knowledge.", does: "An agent can call tools and take multi-step actions; the playground here lets you test one before publishing it." },
    { m: /^deployments?$|^models \+ endpoints$/i, what: "the list of models your project has deployed.", does: "A deployment is a named, callable instance of a model with its own capacity (tokens per minute), version and content filter. Your code calls the deployment name, not the model." },
    { m: /^fine-?tuning$/i, what: "where you train a base model on your own examples.", does: "It produces a custom model version that you then deploy like any other. Use it only when prompting and grounding cannot get the behaviour you need." },
    { m: /^evaluations?$/i, what: "the quality lab: run test sets against a model or agent and score the answers.", does: "Built-in evaluators measure groundedness, relevance, coherence, safety and more, so you can compare prompts, models and versions with numbers instead of gut feel." },
    { m: /^tracing$/i, what: "observability for your app or agent: every request, tool call and model call as a trace.", does: "You use it to see why an answer was slow or wrong: which step took the time, what the model actually received." },
    { m: /^content filters?$|^guardrails( \+ controls)?$|^safety \+ security$/i, what: "the safety layer applied to every deployment.", does: "Filters classify prompts and completions for hate, sexual, violence and self-harm content (and jailbreak attempts); you can tune thresholds or add blocklists per deployment." },
    { m: /^connected resources$/i, what: "the Azure services this project can reach: AI Search, storage, Azure OpenAI, custom keys.", does: "A connection stores the endpoint and credential once so playgrounds, agents and code can use it without pasting keys around." },
    { m: /^users$/i, what: "who can access this project and with which role.", does: "Access is Azure RBAC: Owner, Contributor, Azure AI Developer and so on. Adding a user here grants them the project, not the whole subscription." },
    { m: /^management center$/i, what: "the admin view of hubs, projects, quota, connections and settings in one place.", does: "This is where a lab admin checks quota per model and region or adds a connection every project can share." },
    { m: /^knowledge$/i, what: "where you give the model your own documents (grounding).", does: "You create a knowledge base, add sources (files, blob storage, SharePoint, web), and the portal chunks, embeds and indexes them so answers can cite your content. This pattern is RAG." },
    { m: /^(home|discover)$/i, what: "the Foundry landing page.", does: "It lists your recent projects and highlights new models and features; your work lives inside a project, not here." },
    { m: /^(define|build|operate)$/i, what: "one of the three phases Foundry organises the workspace into.", does: "Define = plan and data, Build = deploy models, prompt, create agents, Operate = evaluate, trace and monitor what is live." },
    // deployment wizard
    { m: /^\+?\s*deploy model$/i, what: "the entry point to create a new deployment.", does: "It offers 'Deploy base model' (a catalog model as published) or 'Deploy fine-tuned model' (one you trained). The deployment becomes an endpoint your code and the playground can call." },
    { m: /^deploy (a )?base model$/i, what: "the option to deploy a foundation model exactly as its provider published it.", does: "No training involved: you shape behaviour with prompts at run time. This is the normal first choice in any lab." },
    { m: /^deploy (a )?fine-?tuned model$/i, what: "the option to deploy a model you customised with your own training data.", does: "Only appears useful once a fine-tuning job has finished; the lab does not need it." },
    { m: /^(confirm|select)$/i, route: /deploy|catalog|model/i, what: "the button that accepts the model you picked in the catalog.", does: "It moves you into the deployment settings for that model." },
    { m: /^customi[sz]e$|^custom(i[sz]e)? settings$/i, what: "the switch from default to explicit deployment settings.", does: "It reveals deployment name, type, model version, tokens-per-minute limit and content filter so you control them instead of accepting defaults." },
    { m: /^deployment name$/i, what: "the alias your code and the playground will call.", does: "It is stable across model versions: redeploy a newer version under the same name and the app keeps working. Names must be unique within the resource." },
    { m: /^deployment type$/i, what: "how capacity is provided for this deployment.", does: "Standard = pay per token in one region; Global Standard = pay per token, routed across regions for more capacity; Data Zone Standard = routed within a geography; Provisioned = reserved throughput you pay for by the hour; Batch = asynchronous, cheaper, slower." },
    { m: /^(global standard|global-standard)$/i, what: "the pay-per-token deployment type routed across Microsoft's global capacity.", does: "Highest availability of capacity for popular models; data is processed in any Azure OpenAI region. Pick it when a regional Standard shows no quota." },
    { m: /^standard$/i, route: /deploy/i, what: "the regional pay-per-token deployment type.", does: "Your requests stay in the resource's region. Capacity can be tight for the newest models." },
    { m: /^provisioned( managed)?(-|\s)?(throughput)?$/i, what: "reserved capacity billed per hour, not per token.", does: "Predictable latency and throughput for production; overkill for a lab." },
    { m: /^model version$/i, what: "the exact snapshot of the model this deployment pins.", does: "Behaviour and pricing can differ between versions; 'Auto-update to default' lets Azure move you forward when a version retires." },
    { m: /^tokens per minute rate limit.*|^rate limit.*tpm.*|^tokens per minute$/i, what: "the deployment's capacity, in thousands of tokens per minute drawn from your model quota.", does: "Requests beyond it get HTTP 429 (throttled). Labs set a small number so one deployment cannot eat the subscription's quota." },
    { m: /^enable dynamic quota$/i, what: "an opt-in to burst above your allocated rate limit when the region has spare capacity.", does: "Useful for spiky workloads; it never guarantees the extra capacity." },
    { m: /^content filter$/i, what: "the safety policy attached to this deployment.", does: "DefaultV2 is Microsoft's balanced policy; custom filters let you change thresholds or add blocklists. It applies to prompts and completions." },
    { m: /^deploy$/i, what: "the button that creates the endpoint.", does: "Azure allocates capacity from your quota, applies the filter and exposes a URL you can call within seconds. From here on, tokens are billed." },
    { m: /^open in playground$/i, what: "a shortcut from a finished deployment straight into the chat playground with it selected.", does: "Saves you finding the deployment in the model picker." },
    { m: /^(get )?endpoint$|^target uri$/i, what: "the HTTPS address your code sends requests to.", does: "Together with a key (or Entra ID token) and the deployment name it is everything an app needs to call the model." },
    { m: /^key( 1| 2)?$|^api key$/i, what: "a shared secret that authenticates calls to this resource.", does: "Two keys exist so you can rotate one while the other stays valid. Treat it like a password; prefer Entra ID auth in production.", danger: null },
    { m: /^regenerate( key)?( 1| 2)?$/i, what: "the button that invalidates a key and issues a new one.", does: "Every app using the old key stops working immediately.", danger: "it invalidates a key other steps or apps may be using" },
    // playground
    { m: /^(give the model )?instructions( and context)?$|^system message$/i, what: "the system message: who the model is, what it may do, how it should answer.", does: "It is sent with every request and outranks anything the user types. Scope, tone, refusals and persona all come from here." },
    { m: /^add your data$|^add a data source$/i, what: "the shortcut to ground the playground on your own content.", does: "It connects a knowledge base or AI Search index so answers cite your documents instead of general training data." },
    { m: /^parameters$/i, what: "the generation settings for each request.", does: "Temperature and Top P control randomness, Max response caps reply length, Past messages controls how much history is resent, Stop sequences end generation early." },
    { m: /^temperature$/i, what: "the randomness dial (0 to 2).", does: "Low values make answers deterministic and repetitive; high values more creative and less reliable. Labs usually keep it around 0.7 or lower for factual tasks." },
    { m: /^top p$/i, what: "nucleus sampling: the model only picks from the most likely tokens whose probabilities add up to P.", does: "Another way to trim randomness; change temperature OR top P, rarely both." },
    { m: /^max (response|tokens)|^max output tokens$/i, what: "the cap on how many tokens the reply may contain.", does: "Too low cuts answers off mid-sentence; it also bounds cost per request." },
    { m: /^past messages included$/i, what: "how many previous turns are resent with each new message.", does: "More history means better context and more tokens per request." },
    { m: /^stop sequences?$/i, what: "strings that make the model stop generating when it produces them.", does: "Handy for structured output, for example stopping at a delimiter." },
    { m: /^(frequency|presence) penalty$/i, what: "a nudge against repeating tokens (frequency) or topics (presence).", does: "Small positive values reduce loops and repetition in long answers." },
    { m: /^send$/i, what: "the button that makes the API call.", does: "Your messages are tokenised, sent to the deployment, and the reply streams back token by token. This is the same call your code will make." },
    { m: /^clear chat$/i, what: "the button that forgets the conversation so far.", does: "The system message and parameters stay; only the message history is dropped." },
    { m: /^view code$/i, what: "the generated code for exactly what the playground just did.", does: "Python, C#, JavaScript, curl and more, with your endpoint and deployment name filled in. Copy it into your app." },
    { m: /^deploy to (a )?web app$/i, what: "a one-click way to publish this chat as an Azure App Service website.", does: "Creates real Azure resources that cost money; not needed for the lab.", danger: "it provisions billable Azure resources outside the lab" },
    { m: /^prompt samples$/i, what: "ready-made system messages for common scenarios.", does: "Pick one to see how a well-structured system message reads, then adapt it." },
    { m: /^(chat|images|audio|completions|real-?time( audio)?|assistants)$/i, route: /playground/i, what: "a playground tab for a different model modality.", does: "Chat is text conversation, Images generates pictures, Audio does speech, Completions is the older single-prompt style. Each needs a deployment of a matching model type." },
    { m: /^model$/i, route: /playground/i, what: "the picker for which deployment the playground talks to.", does: "Only deployments in this project appear. Switch here to compare models on the same prompt." },
    // knowledge / search
    { m: /^create (new )?resource$/i, what: "the button to create an Azure resource the feature depends on, here an Azure AI Search service.", does: "It opens the create form: subscription, resource group, region and pricing tier. Provisioning takes a minute." },
    { m: /^create (a )?knowledge base$/i, what: "the button to create a named container for your grounding sources.", does: "You then add sources, pick an embedding model, and connect the knowledge base to a playground or agent." },
    { m: /^add sources?$/i, what: "the wizard to bring documents into the knowledge base.", does: "Sources can be uploaded files, blob storage, SharePoint or a website; each is chunked, embedded and indexed." },
    { m: /^upload files?( \(file\))?$/i, what: "the source type for documents on your machine.", does: "Files land in the project's storage account and are indexed from there." },
    { m: /^embedding model$/i, what: "the model that turns text into vectors for semantic search.", does: "Similar meanings land close together, so a question finds passages that use different words. Indexing and querying must use the same embedding model." },
    { m: /^save( knowledge base)?$/i, what: "the button that publishes your changes.", does: "After saving, playgrounds and agents can select this knowledge base." },
    { m: /^region$|^location$/i, what: "which Azure region (set of datacentres) hosts the resource.", does: "Capacity, prices and available models vary by region; keep resources that talk to each other in the same one." },
    { m: /^resource group$/i, what: "a folder for related Azure resources with shared lifecycle and permissions.", does: "Deleting the group deletes everything in it; labs usually give you one." },
    { m: /^subscription$/i, what: "the billing and access boundary all your resources live in.", does: "Quota and cost are tracked per subscription; in this lab it is the shared tenant's." },
    { m: /^pricing( tier)?$/i, what: "the SKU that decides capacity and cost of a resource.", does: "For AI Search, Basic is enough for a lab; Standard tiers add replicas, partitions and features." },
    // generic Azure / danger
    { m: /^delete( deployment| resource| project| hub| knowledge base)?$/i, what: "the button that permanently removes this item.", does: "There is no undo.", danger: "it permanently deletes something later steps depend on" },
    { m: /^remove$/i, what: "the button that detaches or removes this item.", does: "Depending on context it deletes a connection, source or user assignment.", danger: "it removes something the lab may still need" },
    { m: /^purge$/i, what: "the button that permanently erases a soft-deleted resource.", does: "After purge the name can be reused and the data is gone.", danger: "it permanently erases a resource" },
    { m: /^cancel$/i, what: "the button that abandons the current form without saving.", does: "Nothing is created or changed." },
    { m: /^(create|next|review \+ create)$/i, what: "the button that moves the form forward.", does: "Review + create validates your inputs; Create submits them to Azure Resource Manager." },
    { m: /^search$|^search (the )?catalog$|^search models$/i, what: "the filter box for this list.", does: "Type part of a name; the list narrows as you type." },
    { m: /^(filter|filters)$/i, what: "the control that narrows the list by facet.", does: "For models: provider, capability, deployment option, license, task." },
    { m: /^notifications?$/i, what: "the bell: status of long-running operations.", does: "Deployments and resource creations report here when they finish or fail." },
    { m: /^(settings|help|feedback)$/i, what: "the portal's own " + "$&".toLowerCase() + " menu.", does: "Not part of the lab." },
    { m: /^copy( to clipboard)?$/i, what: "the copy button.", does: "It puts the adjacent value (an endpoint, key or name) on your clipboard." },
    { m: /^(refresh|reload)$/i, what: "the refresh button for this list.", does: "Re-queries Azure so you see the latest state, for example a deployment finishing." }
  ];

  var ROLE_TEXT = {
    button: "a button: clicking it runs the action its label describes.",
    link: "a link: it navigates to another page or blade.",
    tab: "a tab: it switches which panel is shown below.",
    menuitem: "a navigation entry: it opens that section of the portal.",
    textbox: "a text field: you type a value here.",
    searchbox: "a search field: the list below filters as you type.",
    combobox: "a drop-down: you pick one of several options.",
    listbox: "a list of options to choose from.",
    option: "one option inside a list or drop-down.",
    checkbox: "a checkbox: it turns a setting on or off.",
    switch: "a toggle: it turns a setting on or off.",
    radio: "a radio button: one choice among alternatives.",
    slider: "a slider: it sets a numeric value; drag it or use the arrow keys.",
    spinbutton: "a numeric field with up/down steps.",
    heading: "a section heading: the controls beneath it belong to it.",
    img: "an icon or image.",
    dialog: "a dialog: a form on top of the page that you finish or cancel.",
    row: "a row in a table.",
    gridcell: "a cell in a table.",
    progressbar: "a progress indicator for a running operation.",
    status: "a status message from the portal.",
    alert: "an alert message from the portal.",
    text: "a label or piece of text."
  };

  // ---- describe: the control as data (role, label, state, context) --------------------
  var INTERACTIVE = "button,a[href],[role],input,select,textarea,summary,[tabindex],[aria-label],label,h1,h2,h3,h4,img,li";
  function txt(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function roleOf(el) {
    var r = txt(el.getAttribute("role")).toLowerCase();
    if (r) return r;
    var t = el.tagName.toLowerCase();
    if (t === "button" || (t === "input" && /^(button|submit|reset)$/i.test(el.type || ""))) return "button";
    if (t === "a" && el.getAttribute("href")) return "link";
    if (t === "input") { var ty = (el.type || "text").toLowerCase(); return ty === "checkbox" ? "checkbox" : ty === "radio" ? "radio" : ty === "range" ? "slider" : ty === "search" ? "searchbox" : ty === "number" ? "spinbutton" : "textbox"; }
    if (t === "select") return "combobox";
    if (t === "textarea") return "textbox";
    if (/^h[1-6]$/.test(t)) return "heading";
    if (t === "img" || t === "svg") return "img";
    if (t === "li") return "listitem";
    return "text";
  }
  function nameOf(el) {
    var n = txt(el.getAttribute("aria-label"));
    if (!n && el.getAttribute("aria-labelledby")) { var ids = el.getAttribute("aria-labelledby").split(/\s+/); n = txt(ids.map(function (i) { var e = document.getElementById(i); return e ? e.textContent : ""; }).join(" ")); }
    if (!n) n = txt(el.getAttribute("title"));
    if (!n && el.tagName.toLowerCase() === "img") n = txt(el.getAttribute("alt"));
    if (!n && "placeholder" in el) n = txt(el.placeholder);
    if (!n && el.id) { var lab = document.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]'); if (lab) n = txt(lab.textContent); }
    if (!n) n = txt(el.textContent).slice(0, 80);
    return n;
  }
  function contextOf(el) {
    var sec = el.closest("[aria-labelledby],[aria-label][role=region],section,nav,[role=dialog],[role=navigation],[role=tabpanel],fieldset");
    if (!sec || sec === el) return "";
    var lbl = "";
    if (sec.getAttribute("aria-labelledby")) { var e = document.getElementById(sec.getAttribute("aria-labelledby")); lbl = e ? txt(e.textContent) : ""; }
    if (!lbl) lbl = txt(sec.getAttribute("aria-label"));
    if (!lbl) { var h = sec.querySelector("h1,h2,h3,legend"); lbl = h ? txt(h.textContent) : ""; }
    if (!lbl) { var r = roleOf(sec); lbl = r === "navigation" || sec.tagName.toLowerCase() === "nav" ? "the navigation" : r === "dialog" ? "a dialog" : ""; }
    return lbl.slice(0, 60);
  }
  function describe(el) {
    var target = el;
    // climb to the interactive/semantic ancestor (an icon inside a button is the button)
    for (var n = el, i = 0; n && n !== document.body && i < 6; n = n.parentElement, i++) {
      if (n.matches && n.matches("button,a[href],[role=button],[role=menuitem],[role=tab],[role=link],[role=option],[role=checkbox],[role=switch],[role=radio],[role=combobox],[role=slider],input,select,textarea,summary")) { target = n; break; }
    }
    var role = roleOf(target), name = nameOf(target), state = [];
    if (target.disabled || target.getAttribute("aria-disabled") === "true") state.push("disabled");
    if (target.getAttribute("aria-expanded") === "true") state.push("expanded");
    if (target.getAttribute("aria-expanded") === "false") state.push("collapsed");
    // aria-current IS COMPARED BY VALUE, NEVER BY PRESENCE. getAttribute returns the STRING
    // "false" on an unselected item, and "false" is truthy, so a presence check describes every
    // item in a navigation as "selected". Fluent v9 marks unselected nav items exactly that way.
    // Measured on this lab's Purview: 2 elements, both aria-current="page", none "false" — so
    // this is latent here rather than firing, and it is still wrong.
    var cur = target.getAttribute("aria-current");
    if (target.getAttribute("aria-selected") === "true" || (cur && cur !== "false")) state.push("selected");
    if (target.getAttribute("aria-checked") === "true" || target.checked === true) state.push("on");
    if (target.getAttribute("aria-checked") === "false" || target.checked === false && /checkbox|radio/.test(role)) state.push("off");
    if (target.required || target.getAttribute("aria-required") === "true") state.push("required");
    return { el: target, role: role, name: name, tag: target.tagName.toLowerCase(), state: state,
             context: contextOf(target), href: target.getAttribute && target.getAttribute("href") || "",
             disabled: state.indexOf("disabled") >= 0 };
  }
  function interesting(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.closest && el.closest("[data-labpilot='1'],#labpilot-overlay-root,#labpilot-controls,#labpilot-rocky")) return false;
    var d = describe(el);
    if (d.role !== "text" && d.role !== "listitem") return !!d.name || d.role === "img";
    return !!d.name && d.name.length >= 2 && d.name.length <= 80;   // a label / short text is fine to ask about
  }

  // ---- lookup / explain / danger --------------------------------------------------------
  function lookup(desc, route) {
    var name = desc && desc.name || "";
    if (!name) return null;
    var path = route == null ? (location.pathname + location.hash) : String(route);
    for (var i = 0; i < KB.length; i++) {
      var e = KB[i];
      if (!e.m.test(name)) continue;
      if (e.route && !e.route.test(path)) continue;
      return e;
    }
    return null;
  }
  function stepRef(desc, steps) {
    if (!steps || !steps.length) return "";
    var n = (desc.name || "").toLowerCase();
    if (!n) return "";
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i], tg = (s.targets || [])[0], sel = tg && (tg.selectors || [])[0], a = sel && sel.attrs || {};
      var cands = [a.ariaLabel, a.text, a.imgAlt, a.fieldLabel, a.placeholder, tg && tg.label].filter(Boolean).map(function (x) { return String(x).toLowerCase(); });
      if (cands.some(function (c) { return c === n || (c.length > 3 && n.indexOf(c) === 0) || (n.length > 3 && c.indexOf(n) === 0); }))
        return " In YOUR LAB this is step " + (i + 1) + ": “" + s.text + "”";
    }
    return "";
  }
  function stateText(desc) {
    if (!desc.state.length) return "";
    var map = { disabled: "It is disabled right now, usually because a prerequisite is missing.", expanded: "It is currently expanded.", collapsed: "It is currently collapsed.", selected: "It is the current selection.", on: "It is switched on.", off: "It is switched off.", required: "It is required." };
    return desc.state.map(function (s) { return map[s] || ""; }).filter(Boolean).join(" ");
  }
  function explain(desc, opts) {
    opts = opts || {};
    var e = lookup(desc, opts.route), label = desc.name ? "“" + desc.name + "”" : "This";
    var out;
    if (e) {
      var what = e.what.replace(/\$&/g, desc.name);
      out = label + " is " + what + " " + e.does;
    } else {
      var rt = ROLE_TEXT[desc.role] || ("a " + desc.role + ".");
      out = label + " is " + rt;
      if (desc.context) out += " It sits in " + (/^(the |a )/i.test(desc.context) ? "" : "the “") + desc.context + (/^(the |a )/i.test(desc.context) ? "" : "” section") + ".";
      if (desc.role === "link" && desc.href && !/^#|^javascript/i.test(desc.href)) out += " It points to " + desc.href.replace(/^https?:\/\//, "").slice(0, 60) + ".";
      out += " I don't have lab notes on this one, so that is exactly what I can see — not a guess about its purpose.";
    }
    var st = stateText(desc); if (st) out += " " + st;
    if (e && e.tip) out += " Tip: " + e.tip;
    out += stepRef(desc, opts.steps);
    return out;
  }
  var DANGER_RX = /\b(delete|remove|purge|deprovision|revoke|regenerate|reset|destroy|cancel subscription|unassign)\b/i;
  function danger(desc) {
    if (!desc || !desc.name) return null;
    if (!/^(button|menuitem|link)$/.test(desc.role)) return null;
    var e = lookup(desc);
    if (e && e.danger) return { label: desc.name, why: e.danger };
    if (DANGER_RX.test(desc.name) && !/clear chat|remove filter|reset (filters?|view|zoom)/i.test(desc.name)) return { label: desc.name, why: "it looks like it deletes, removes or resets something the lab may depend on" };
    return null;
  }

  window.LabPilotKB = { describe: describe, lookup: lookup, explain: explain, danger: danger, interesting: interesting, _entries: KB, _roles: ROLE_TEXT };
})();
