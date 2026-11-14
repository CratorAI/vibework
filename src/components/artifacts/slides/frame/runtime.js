/* Slides frame runtime. Runs inside the sandboxed artifact:// page (opaque
   origin). Talks to the editor only through postMessage; every message from
   the parent is checked to come from window.parent. Two modes:
   - "stage": one slide scaled to fit; in-place text editing; presenting
   - "strip": the filmstrip of thumbnails; select and drag to reorder */
(function () {
  "use strict";
  var W = 1920, H = 1080;
  var mode = null;
  var deck = null;          // { themeId, extraCss, slides: [{ html, title }] }
  var version = 0;
  var current = 0;
  var editable = false;
  var present = false;
  var orientation = "vertical";
  var editing = null;       // { el, field, before, slide }
  var pending = null;       // deck message deferred while editing
  var root = document.getElementById("root");
  var extraStyle = document.getElementById("extra");

  function post(msg) { window.parent.postMessage(msg, "*"); }

  function num(v, lo, hi) { return typeof v === "number" && isFinite(v) && v >= lo && v <= hi; }

  /* ---------- DOM -> runs (the inverse of the renderer's inline markup) */
  function runsOf(el) {
    var out = [];
    function walk(node, f) {
      if (node.nodeType === 3) { out.push(Object.assign({ text: node.nodeValue }, f)); return; }
      if (node.nodeType !== 1) return;
      var tag = node.tagName;
      if (tag === "BR") { out.push(Object.assign({ text: " " }, f)); return; }
      var g = Object.assign({}, f);
      if (tag === "STRONG" || tag === "B") g.b = true;
      if (tag === "EM" || tag === "I") g.i = true;
      if (tag === "CODE") g.code = true;
      if (tag === "MARK") g.mark = true;
      if (node.classList && node.classList.contains("link") && node.getAttribute("data-href")) g.href = node.getAttribute("data-href");
      var fw = node.style && node.style.fontWeight;
      if (fw === "bold" || +fw >= 600) g.b = true;
      if (node.style && node.style.fontStyle === "italic") g.i = true;
      var block = tag === "DIV" || tag === "P";
      if (block && out.length) out.push(Object.assign({ text: " " }, f));
      for (var c = node.firstChild; c; c = c.nextSibling) walk(c, g);
    }
    for (var c = el.firstChild; c; c = c.nextSibling) walk(c, {});
    return out;
  }
  function runsKey(r) { return JSON.stringify(r.map(function (x) { return [x.text.replace(/\s+/g, " "), !!x.b, !!x.i, !!x.code, !!x.mark, x.href || ""]; })); }

  /* ---------- rendering */
  function setTheme() {
    root.setAttribute("data-theme", deck.themeId);
    extraStyle.textContent = deck.extraCss || "";
  }

  function fitStage() {
    var box = document.getElementById("stage");
    if (!box) return;
    var pad = present ? 0 : 2;
    var s = Math.min((window.innerWidth - pad * 2) / W, (window.innerHeight - pad * 2) / H);
    var scaler = box.firstElementChild;
    if (!scaler) return;
    scaler.style.transform = "scale(" + s + ")";
    scaler.style.left = Math.round((window.innerWidth - W * s) / 2) + "px";
    scaler.style.top = Math.round((window.innerHeight - H * s) / 2) + "px";
  }

  function renderStage() {
    if (!deck) return;
    setTheme();
    root.className = "deck mode-stage" + (present ? " presenting" : "") + (editable && !present ? " editable" : "");
    var n = deck.slides.length;
    if (!n) {
      root.innerHTML = '<div id="stage"></div>';
      return;
    }
    if (current >= n) current = n - 1;
    root.innerHTML = '<div id="stage"><div class="scaler">' + deck.slides[current].html + "</div></div>";
    if (editable && !present) {
      var els = root.querySelectorAll("[data-f]");
      for (var k = 0; k < els.length; k++) {
        els[k].setAttribute("contenteditable", "true");
        els[k].setAttribute("spellcheck", "true");
      }
    }
    fitStage();
  }

  var thumbW = 160;
  function renderStrip() {
    if (!deck) return;
    setTheme();
    root.className = "deck mode-strip " + orientation;
    var html = "";
    for (var k = 0; k < deck.slides.length; k++) {
      html += '<div class="th' + (k === current ? " sel" : "") + '" data-i="' + k + '" title="' + esc(deck.slides[k].title || "") + '">' +
        '<div class="no">' + (k + 1) + '</div><div class="fr"><div class="scaler">' + deck.slides[k].html + "</div></div></div>";
    }
    root.innerHTML = '<div id="strip">' + html + '<div id="drop"></div></div>';
    layoutStrip();
    scrollToCurrent(false);
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  function layoutStrip() {
    var strip = document.getElementById("strip");
    if (!strip) return;
    if (orientation === "vertical") thumbW = Math.max(80, window.innerWidth - 12 - 28 - 12);
    else thumbW = Math.max(80, Math.round((window.innerHeight - 36) * 16 / 9));
    var s = thumbW / W;
    var frames = strip.querySelectorAll(".fr");
    for (var k = 0; k < frames.length; k++) {
      frames[k].style.width = thumbW + "px";
      frames[k].style.height = Math.round(thumbW * 9 / 16) + "px";
      frames[k].firstElementChild.style.transform = "scale(" + s + ")";
    }
  }

  function scrollToCurrent(smooth) {
    var el = root.querySelector('.th[data-i="' + current + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: smooth ? "smooth" : "auto" });
  }

  function setCurrent(i, notify) {
    if (!deck || !deck.slides.length) return;
    i = Math.max(0, Math.min(deck.slides.length - 1, i));
    if (mode === "strip") {
      var prev = root.querySelector(".th.sel");
      if (prev) prev.classList.remove("sel");
      current = i;
      var el = root.querySelector('.th[data-i="' + i + '"]');
      if (el) el.classList.add("sel");
      scrollToCurrent(true);
    } else if (i !== current) {
      current = i;
      renderStage();
    }
    if (notify) post({ type: mode === "strip" ? "select" : "nav", index: i });
  }

  /* ---------- messages from the editor */
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || typeof m !== "object" || typeof m.type !== "string") return;
    if (m.type === "init") {
      mode = m.mode === "strip" ? "strip" : "stage";
      document.documentElement.className = "m-" + mode;
    } else if (m.type === "chrome" && m.vars && typeof m.vars === "object") {
      for (var key in m.vars) {
        if (/^--c-[a-z0-9-]+$/.test(key) && typeof m.vars[key] === "string" && m.vars[key].length < 80 && !/[;{}<>]/.test(m.vars[key])) {
          document.documentElement.style.setProperty(key, m.vars[key]);
        }
      }
      if (m.scheme === "dark" || m.scheme === "light") document.documentElement.style.colorScheme = m.scheme;
      if (m.orientation === "horizontal" || m.orientation === "vertical") {
        var changed = orientation !== m.orientation;
        orientation = m.orientation;
        if (mode === "strip" && changed && deck) renderStrip();
      }
    } else if (m.type === "deck" && m.deck && Array.isArray(m.deck.slides)) {
      var apply = function () {
        deck = { themeId: String(m.deck.themeId || ""), extraCss: String(m.deck.extraCss || ""), slides: m.deck.slides.map(function (s) { return { html: String(s.html || ""), title: String(s.title || "") }; }) };
        version = num(m.version, 0, 1e12) ? m.version : version;
        if (num(m.current, 0, 1e6)) current = m.current;
        editable = m.editable === true;
        if (mode === "strip") renderStrip(); else renderStage();
      };
      if (editing) pending = apply; else apply();
    } else if (m.type === "version" && num(m.version, 0, 1e12)) {
      version = m.version;
    } else if (m.type === "goto" && num(m.index, 0, 1e6)) {
      if (editing) return;
      setCurrent(m.index, false);
    } else if (m.type === "present") {
      present = m.on === true;
      if (mode === "stage") { renderStage(); if (present) window.focus(); }
    } else if (m.type === "focus") {
      window.focus();
    }
  });

  /* ---------- stage: keys, clicks, editing */
  function isEditTarget(el) { return el && el.closest && el.closest("[data-f][contenteditable]"); }

  document.addEventListener("keydown", function (e) {
    if (mode === "strip") {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setCurrent(current + 1, true); }
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setCurrent(current - 1, true); }
      return;
    }
    if (editing) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editing.el.blur(); }
      else if (e.key === "Escape") { e.preventDefault(); editing.cancel = true; editing.el.innerHTML = editing.html; editing.el.blur(); }
      return;
    }
    var k = e.key;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (k === "z" || k === "Z")) { e.preventDefault(); post({ type: "undo" }); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " " || (present && k === "Enter")) { e.preventDefault(); setCurrent(current + 1, true); }
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || (present && k === "Backspace")) { e.preventDefault(); setCurrent(current - 1, true); }
    else if (k === "Home") { e.preventDefault(); setCurrent(0, true); }
    else if (k === "End") { e.preventDefault(); setCurrent(1e6, true); }
    else if (k === "Escape") { e.preventDefault(); post({ type: "escape" }); }
  });

  document.addEventListener("click", function (e) {
    if (mode !== "stage" || !present) return;
    if (e.button !== 0) return;
    setCurrent(current + (e.shiftKey ? -1 : 1), true);
  });

  document.addEventListener("focusin", function (e) {
    var el = isEditTarget(e.target);
    if (!el || mode !== "stage") return;
    var slideEl = el.closest("[data-i]");
    editing = { el: el, field: +el.getAttribute("data-f"), slide: slideEl ? +slideEl.getAttribute("data-i") : current, html: el.innerHTML, before: runsKey(runsOf(el)), cancel: false };
    post({ type: "editing", on: true });
  });

  document.addEventListener("focusout", function (e) {
    if (!editing || e.target !== editing.el) return;
    var ed = editing;
    editing = null;
    if (!ed.cancel) {
      var runs = runsOf(ed.el);
      if (runsKey(runs) !== ed.before) post({ type: "edit", version: version, slide: ed.slide, field: ed.field, runs: runs });
    }
    post({ type: "editing", on: false });
    if (pending) { var p = pending; pending = null; p(); }
  });

  document.addEventListener("paste", function (e) {
    if (!editing) return;
    e.preventDefault();
    var text = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
    document.execCommand("insertText", false, text.replace(/\s*\n\s*/g, " "));
  });
  document.addEventListener("drop", function (e) { if (mode === "stage") e.preventDefault(); });

  /* missing images: say which file, instead of a broken-image glyph */
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (!t || t.tagName !== "IMG") return;
    var box = t.parentNode;
    if (!box) return;
    var note = document.createElement("div");
    note.className = "missing";
    note.textContent = "Image not found: " + (t.getAttribute("src") || "");
    box.replaceChild(note, t);
  }, true);

  /* ---------- strip: select, drag to reorder */
  var drag = null;
  document.addEventListener("pointerdown", function (e) {
    if (mode !== "strip" || e.button !== 0) return;
    var th = e.target.closest && e.target.closest(".th");
    if (!th) return;
    drag = { from: +th.getAttribute("data-i"), x: e.clientX, y: e.clientY, active: false, to: null, id: e.pointerId };
    try { th.setPointerCapture(e.pointerId); } catch (_) {}
  });
  document.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
    drag.active = true;
    root.classList.add("dragging");
    var ths = root.querySelectorAll(".th");
    var vertical = orientation === "vertical";
    var to = ths.length;
    for (var k = 0; k < ths.length; k++) {
      var r = ths[k].getBoundingClientRect();
      var mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
      if ((vertical ? e.clientY : e.clientX) < mid) { to = k; break; }
    }
    drag.to = to;
    var drop = document.getElementById("drop");
    var strip = document.getElementById("strip");
    if (drop && strip) {
      var ref = ths[Math.min(to, ths.length - 1)].getBoundingClientRect();
      var sr = strip.getBoundingClientRect();
      drop.style.display = "block";
      if (vertical) {
        var y = to < ths.length ? ref.top - 6 : ref.bottom + 4;
        drop.style.cssText = "display:block;left:12px;right:12px;height:2px;top:" + (y - sr.top + strip.scrollTop) + "px";
      } else {
        var x = to < ths.length ? ref.left - 6 : ref.right + 4;
        drop.style.cssText = "display:block;top:10px;bottom:10px;width:2px;left:" + (x - sr.left + strip.scrollLeft) + "px";
      }
    }
    // auto-scroll near the edges
    var stripEl = document.getElementById("strip");
    if (stripEl) {
      if (vertical) {
        if (e.clientY < 30) stripEl.scrollTop -= 12; else if (e.clientY > window.innerHeight - 30) stripEl.scrollTop += 12;
      } else {
        if (e.clientX < 30) stripEl.scrollLeft -= 12; else if (e.clientX > window.innerWidth - 30) stripEl.scrollLeft += 12;
      }
    }
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    root.classList.remove("dragging");
    var drop = document.getElementById("drop");
    if (drop) drop.style.display = "none";
    if (cancelled) return;
    if (!d.active) { setCurrent(d.from, true); return; }
    if (d.to === null) return;
    var to = d.to > d.from ? d.to - 1 : d.to;
    if (to !== d.from) post({ type: "move", from: d.from, to: to });
  }
  document.addEventListener("pointerup", function (e) { endDrag(e, false); });
  document.addEventListener("pointercancel", function (e) { endDrag(e, true); });

  window.addEventListener("resize", function () {
    if (mode === "strip") layoutStrip(); else fitStage();
  });

  post({ type: "ready" });
})();
