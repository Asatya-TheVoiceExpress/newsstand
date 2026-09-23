(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function qr(data) {
    try {
      var q = qrcode(0, "M"); q.addData(data); q.make();
      return "data:image/svg+xml," + encodeURIComponent(q.createSvgTag(4, 8));
    } catch (e) { return ""; }
  }

  var CFG, PAY, API, CUR, BRAND, CAT, SECTIONS, SERIES = [],
      BY_ID = {}, SECLABEL = {}, BY_SERIES = {};
  var TYPE = { gazette: "Gazette", broadsheet: "Broadsheet", compilation: "Compilation",
    booklet: "Booklet", epub: "ePub", pdf: "PDF", magazine_pdf: "Magazine", magazine_html: "eMag" };
  var SYM = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

  Promise.all([
    fetch("config.json").then(function (r) { return r.json(); }).catch(function () { return {}; }),
    fetch("catalog.json").then(function (r) { return r.json(); })
  ]).then(function (res) {
    CFG = res[0] || {}; var data = res[1] || {};
    PAY = CFG.pay || {}; API = CFG.api || "";
    BRAND = CFG.brand || "The Voice Express";
    CUR = SYM[CFG.currency] || "";
    CAT = (data.catalog || []).map(normalize);
    SECTIONS = data.sections || [];
    SERIES = (data.series || []).filter(function (s) { return s && s.key; });
    SERIES.forEach(function (s) { BY_SERIES[s.key] = s; });
    SECTIONS.forEach(function (s) { SECLABEL[s.key] = s.label; });
    CAT.forEach(function (x) {
      BY_ID[x.id] = x;
      x._idx = (x.title + " " + (x.subtitle || "") + " " + (x.author || "") + " " +
        (x.tags || []).join(" ") + " " + (TYPE[x.type] || x.type) + " " +
        (SECLABEL[x.section] || "") + " " + (x.year || "")).toLowerCase();
    });
    if (CFG.logo) $("#brand-logo").src = CFG.logo;
    if (CFG.brand) $(".brand-txt").innerHTML = esc(CFG.brand) + " <em>Stand</em>";
    init(data.generated || "");
  }).catch(function (err) {
    $("#app").innerHTML = "";
    $("#app").appendChild(el("p", "empty",
      "The stand could not be loaded just now. Please check your connection and try again in a moment."));
    console.error(err);
  });

  function esc(s) { return (s || "").replace(/[<>&]/g, function (m) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]; }); }

  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function str(v) { return typeof v === "string" ? v : ""; }
  function normalize(e) {
    e = e || {};
    var file = str(e.file);
    var n = {
      id: str(e.id) || slug(file) || ("item-" + Math.random().toString(36).slice(2, 8)),
      file: file,
      url: str(e.url),
      ext: String(e.ext || file.split(".").pop() || "").toLowerCase(),
      read_url: str(e.read_url),
      read_ext: String(e.read_ext || "").toLowerCase(),
      title: str(e.title).trim() || file || "Untitled",
      subtitle: str(e.subtitle),
      author: str(e.author),
      type: str(e.type) || "booklet",
      section: str(e.section) || "magazines",
      cover: str(e.cover) || null,
      tags: Array.isArray(e.tags) ? e.tags.filter(function (t) { return typeof t === "string" && t; }) : [],
      date: str(e.date).slice(0, 10),
      size: +e.size || 0,
      currency: str(e.currency) || CFG.currency || "INR",
      price_min: +e.price_min || 0,
      price_sugg: +e.price_sugg || 0,

      byline: str(e.byline),
      authors: Array.isArray(e.authors)
        ? e.authors.filter(function (a) { return a && a.name; })
            .map(function (a) { return { name: str(a.name), role: str(a.role) || "author" }; })
        : [],
      description: str(e.description),
      reading_time: +e.reading_time || 0,
      category: str(e.category),
      section_name: str(e.section_name),
      article_count: +e.article_count || 0,
      issue_number: str(e.issue_number),
      contents: Array.isArray(e.contents)
        ? e.contents.filter(function (c) { return c && (c.title || c.date); })
            .map(function (c) {
              return { id: c.id, title: str(c.title) || "Untitled",
                       subtitle: str(c.subtitle), date: str(c.date).slice(0, 10) };
            })
        : [],
      series: (e.series && str(e.series.key)) ? {
        key: str(e.series.key),
        label: str(e.series.label) || str(e.series.key),
        kind: str(e.series.kind) || "compilations",
        role: str(e.series.role),
        period: str(e.series.period),
        period_label: str(e.series.period_label),
        range: Array.isArray(e.series.range) ? e.series.range : null
      } : null
    };
    n.year = str(e.year) || n.date.slice(0, 4);
    return n;
  }

  var USER = localStorage.getItem("ve_user") || "";
  var LIKES = {};
  var LIKED = (function () {
    try { return new Set(JSON.parse(localStorage.getItem("ve_liked") || "[]")); }
    catch (e) { return new Set(); }
  })();
  function persistLiked() {
    try { localStorage.setItem("ve_liked", JSON.stringify(Array.from(LIKED))); } catch (e) {}
  }
  var LIB, DLS, READS, POS;
  function progressOf(id) { var v = POS && POS[id]; return typeof v === "number" && v > 0 ? Math.min(1, v) : 0; }
  function uk(p) { return p + (USER || "anon"); }
  function loadSet(k) { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch (e) { return new Set(); } }
  function loadArr(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
  function loadMap(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } }
  function persistLib() {
    localStorage.setItem(uk("ve_lib_"), JSON.stringify(Array.from(LIB)));
    if (USER && API) jsonp({ action: "savelib", username: USER, library: JSON.stringify(Array.from(LIB)) }).catch(function () {});
  }

  function jsonp(params) {
    return new Promise(function (res, rej) {
      if (!API) { rej("noapi"); return; }
      var cb = "ve_cb_" + Math.random().toString(36).slice(2);
      var s = document.createElement("script");
      var to = setTimeout(function () { cleanup(); rej("timeout"); }, 12000);
      function cleanup() { clearTimeout(to); try { delete window[cb]; } catch (e) {} s.remove(); }
      window[cb] = function (d) { cleanup(); res(d); };
      params.callback = cb;
      s.src = API + (API.indexOf("?") > -1 ? "&" : "?") + new URLSearchParams(params).toString();
      s.onerror = function () { cleanup(); rej("neterr"); };
      document.head.appendChild(s);
    });
  }

  function search(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return CAT.map(function (x) {
      var score = 0, tl = x.title.toLowerCase();
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i];
        if (x._idx.indexOf(t) === -1) return { x: x, score: -1 };
        score += tl.indexOf(t) === 0 ? 5 : tl.indexOf(t) > -1 ? 3 : 1;
      }
      return { x: x, score: score };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score || (b.x.date || "").localeCompare(a.x.date || ""); })
      .map(function (r) { return r.x; });
  }

  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var io = (!REDUCED && "IntersectionObserver" in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px 120px 0px" }) : null;
  function reveal(n) {
    if (!io) return;                       
    n.classList.add("reveal");
    io.observe(n);
    setTimeout(function () {
      if (n.classList.contains("in")) return;
      n.classList.add("in");
      try { io.unobserve(n); } catch (e) {}
    }, 1400);
  }

  function card(x) {
    var c = el("article", "card");
    var cov = el("div", "cover");
    if (x.cover) {
      var im = el("img"); im.loading = "lazy"; im.decoding = "async";
      im.src = x.cover; im.alt = ""; cov.appendChild(im);
    }
    cov.appendChild(el("span", "badge", TYPE[x.type] || x.type));
    var saved = LIB.has(x.id);
    var bm = el("button", "bookmark" + (saved ? " on" : ""), saved ? "★" : "☆");
    bm.title = "Save to your library";
    bm.setAttribute("aria-label", "Save “" + x.title + "” to your library");
    bm.setAttribute("aria-pressed", saved ? "true" : "false");
    bm.onclick = function (ev) { ev.stopPropagation(); toggleSave(x, bm); };
    cov.appendChild(bm);
    var hint = el("div", "read-hint"); hint.appendChild(el("span", null, "Read")); cov.appendChild(hint);
    cov.setAttribute("role", "button");
    cov.tabIndex = 0;
    cov.setAttribute("aria-label", "Read “" + x.title + "”");
    cov.onclick = function () { openReader(x); };
    cov.onkeydown = function (ev) {
      if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") { ev.preventDefault(); openReader(x); }
    };
    var pr = progressOf(x.id);
    if (pr > 0.01) {
      hint.firstChild.textContent = pr >= 0.95 ? "Read again" : "Resume";
      cov.setAttribute("aria-label", (pr >= 0.95 ? "Read “" : "Resume “") + x.title + "”");
      var pw = el("div", "card-prog" + (pr >= 0.95 ? " done" : ""));
      var pb = el("span"); pb.style.width = Math.min(100, Math.round(pr * 100)) + "%";
      pw.title = pr >= 0.95 ? "Finished" : Math.round(pr * 100) + "% read";
      pw.appendChild(pb); cov.appendChild(pw);
    }
    c.appendChild(cov);
    var b = el("div", "card-b");
    var t = el("h3", "card-t");
    var tb = el("button", null, x.title);
    tb.onclick = function () { openModal(x); };
    t.appendChild(tb); b.appendChild(t);
    if (x.subtitle) b.appendChild(el("p", "card-s", x.subtitle));
    var m = el("div", "card-m");
    m.appendChild(el("span", "date", (x.date || "").slice(0, 10)));
    m.appendChild(el("span", "ext", (x.ext || "").toUpperCase()));
    if (LIKES[x.id] > 0) {
      var lk = el("span", "card-likes", "♡ " + LIKES[x.id]);
      lk.title = LIKES[x.id] === 1 ? "1 reader marked this" : LIKES[x.id] + " readers marked this";
      m.appendChild(lk);
    }
    b.appendChild(m);
    var g = el("button", "get", "Read · Get"); g.onclick = function () { openModal(x); }; b.appendChild(g);
    c.appendChild(b);
    return c;
  }
  function grid(items) { var g = el("div", "grid"); items.forEach(function (x) { g.appendChild(card(x)); }); return g; }

  function row(title, items, seeAll) {
    if (!items.length) return null;
    var wrap = el("section", "row");
    var h = el("div", "row-head");
    h.appendChild(el("h2", null, title));
    h.appendChild(el("span", "ln"));
    if (seeAll) {
      var sa = el("a", "seeall", "See all");
      sa.href = seeAll; sa.dataset.go = "";
      sa.setAttribute("aria-label", "See all — " + title);
      h.appendChild(sa);
    }
    wrap.appendChild(h);
    var rw = el("div", "row-wrap"), sc = el("div", "row-scroll");
    sc.setAttribute("role", "region"); sc.setAttribute("aria-label", title);
    items.forEach(function (x) { sc.appendChild(card(x)); });
    var prev = el("button", "row-nav prev", "‹"), next = el("button", "row-nav next", "›");
    prev.setAttribute("aria-label", "Scroll " + title + " backward");
    next.setAttribute("aria-label", "Scroll " + title + " forward");
    prev.onclick = function () { sc.scrollBy({ left: -sc.clientWidth * 0.8, behavior: "smooth" }); };
    next.onclick = function () { sc.scrollBy({ left: sc.clientWidth * 0.8, behavior: "smooth" }); };
    function edges() {
      var max = sc.scrollWidth - sc.clientWidth;
      var l = sc.scrollLeft > 4, r = sc.scrollLeft < max - 4;
      sc.classList.toggle("more-l", l);
      sc.classList.toggle("more-r", r);
      prev.disabled = !l; next.disabled = !r;
    }
    sc.addEventListener("scroll", edges, { passive: true });
    if ("ResizeObserver" in window) { try { new ResizeObserver(edges).observe(sc); } catch (e) {} }
    setTimeout(edges, 0);
    rw.appendChild(prev); rw.appendChild(sc); rw.appendChild(next);
    wrap.appendChild(rw); reveal(wrap);
    return wrap;
  }

  var app;
  function announce(m) { var l = $("#live"); if (l) l.textContent = m || ""; }
  function swap(node) { app.innerHTML = ""; app.appendChild(node); window.scrollTo({ top: 0 }); }
  var vtBusy = false;
  function setView(node) {
    if (REDUCED || typeof document.startViewTransition !== "function" || vtBusy) return swap(node);
    var didSwap = false, vt;
    function run() { didSwap = true; swap(node); }
    try { vt = document.startViewTransition(run); }
    catch (e) { return run(); }
    vtBusy = true;
    function done() { vtBusy = false; if (!didSwap) run(); }
    if (vt && vt.finished && vt.finished.then) vt.finished.then(done, done); else done();
    if (vt && vt.ready && vt.ready.catch) vt.ready.catch(function () {});
    if (vt && vt.updateCallbackDone && vt.updateCallbackDone.catch) vt.updateCallbackDone.catch(function () {});
  }
  function byDate(a, b) { return (b.date || "").localeCompare(a.date || ""); }
  function wrapFrag(f) { var d = el("div"); d.appendChild(f); return d; }
  function headLine(title, sub) {
    var h = el("div", "sec-head");
    h.appendChild(el("h2", null, title));
    if (sub) h.appendChild(el("span", "count", sub));
    h.appendChild(el("span", "ln"));
    return h;
  }
  function countBy(list, key) { var o = {}; list.forEach(function (x) { var v = x[key]; if (v) o[v] = (o[v] || 0) + 1; }); return o; }
  function inSeries(key) { return CAT.filter(function (x) { return x.series && x.series.key === key; }); }

  function viewSeries(key) {
    var s = BY_SERIES[key];
    var items = inSeries(key);
    if (!s || !items.length) { toast("Unknown series"); return viewHome(); }
    var box = el("div");

    var hero = el("div", "hero series-hero");
    hero.appendChild(el("div", "kick", s.kind === "issues" ? "Edition run" : "Column"));
    hero.appendChild(el("h1", null, s.label));
    var span = (s.earliest || "").slice(0, 4);
    var to = (s.latest || "").slice(0, 4);
    hero.appendChild(el("div", "stat",
      items.length + " in the run" + (span ? "  ·  " + (span === to ? span : span + "–" + to) : "")));
    box.appendChild(hero);

    if (s.kind === "issues") {
      var years = {};
      items.forEach(function (x) { (years[x.year] = years[x.year] || []).push(x); });
      Object.keys(years).sort().reverse().forEach(function (y) {
        box.appendChild(headLine(y, years[y].length + " editions"));
        box.appendChild(grid(years[y].sort(byDate)));
      });
    } else {
      var order = ["all", "year", "month", "week"];
      var groups = {};
      items.forEach(function (x) {
        var p = (x.series && x.series.period) || "other";
        (groups[p] = groups[p] || []).push(x);
      });
      order.concat(Object.keys(groups)).forEach(function (p) {
        if (!groups[p]) return;
        var g = groups[p]; delete groups[p];
        var label = p === "all" ? "Everything" : p === "year" ? "By year"
          : p === "month" ? "By month" : p === "week" ? "By week" : "Other";
        box.appendChild(headLine(label, g.length + (g.length === 1 ? " edition" : " editions")));
        box.appendChild(grid(g.sort(byDate)));
      });
    }
    announce(s.label + " — " + items.length + " in the run");
    setView(box);
  }

  function viewHome() {
    var f = document.createDocumentFragment();
    var hero = el("div", "hero");
    hero.appendChild(el("h1", null, "The Reading Room"));
    hero.appendChild(el("div", "stat", CAT.length + " publications  ·  " + SECTIONS.length + " collections"));
    f.appendChild(hero);

    var cont = continueReading();
    if (cont.length) { var rc = row("Continue reading", cont, null); if (rc) f.appendChild(rc); }

    var seen = {};
    var newest = CAT.slice().sort(byDate).filter(function (x) {
      if (!x.series) return true;
      if (seen[x.series.key]) return false;
      seen[x.series.key] = 1; return true;
    }).slice(0, 12);
    var r0 = row("New arrivals", newest, "#/browse"); if (r0) f.appendChild(r0);

    SERIES.forEach(function (s) {
      var items = inSeries(s.key).sort(byDate).slice(0, 14);
      var r = row(s.label, items, "#/series/" + s.key); if (r) f.appendChild(r);
    });

    SECTIONS.forEach(function (s) {
      var items = CAT.filter(function (x) {
        return x.section === s.key && !x.series;   
      }).sort(byDate).slice(0, 14);
      var r = row(s.label, items, "#/browse/" + s.key); if (r) f.appendChild(r);
    });
    setView(wrapFrag(f));
  }

  function viewBrowse(section, query) {
    query = query || new URLSearchParams("");
    var state = {
      section: section || "",
      type: query.get("type") || "",
      year: query.get("year") || "",
      beat: query.get("beat") || "",
      cat: query.get("cat") || "",
      tag: query.get("tag") || "",
      sort: query.get("sort") || "new"
    };
    if (state.type && !state.section) {
      var seen = CAT.filter(function (x) { return x.type === state.type; })[0];
      if (seen && seen.section) { state.section = seen.section; state.type = ""; }
    }
    function syncHash() {
      var q = [];
      if (state.type) q.push("type=" + encodeURIComponent(state.type));
      if (state.year) q.push("year=" + encodeURIComponent(state.year));
      if (state.beat) q.push("beat=" + encodeURIComponent(state.beat));
      if (state.cat) q.push("cat=" + encodeURIComponent(state.cat));
      if (state.tag) q.push("tag=" + encodeURIComponent(state.tag));
      if (state.sort && state.sort !== "new") q.push("sort=" + encodeURIComponent(state.sort));
      setHashQuiet("#/browse" + (state.section ? "/" + state.section : "") + (q.length ? "?" + q.join("&") : ""));
      setNav("browse", state.section);
    }
    var box = el("div");
    var headEl = headLine(section ? SECLABEL[section] || "Browse" : "Browse", "");
    box.appendChild(headEl);
    function drawHead() { headEl.firstChild.textContent = state.section ? (SECLABEL[state.section] || "Browse") : "Browse"; }
    var layout = el("div", "browse"), facets = el("aside", "facets"), main = el("div");
    layout.appendChild(facets); layout.appendChild(main); box.appendChild(layout);
    function base() { return state.section ? CAT.filter(function (x) { return x.section === state.section; }) : CAT.slice(); }
    function apply() {
      var list = base();
      if (state.type) list = list.filter(function (x) { return x.type === state.type; });
      if (state.year) list = list.filter(function (x) { return x.year === state.year; });
      if (state.beat) list = list.filter(function (x) { return x.section_name === state.beat; });
      if (state.cat) list = list.filter(function (x) { return x.category === state.cat; });
      if (state.tag) list = list.filter(function (x) { return (x.tags || []).indexOf(state.tag) > -1; });
      list.sort(state.sort === "az" ? function (a, b) { return a.title.localeCompare(b.title); }
        : state.sort === "old" ? function (a, b) { return (a.date || "").localeCompare(b.date || ""); } : byDate);
      syncHash(); drawHead(); drawFacets(); drawMain(list);
      announce(list.length + (list.length === 1 ? " title" : " titles"));
    }
    function byCount(pool, key) {
      var c = countBy(pool, key);
      return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b); })
        .map(function (v) { return [v, v]; });
    }
    function drawFacets() {
      facets.innerHTML = "";
      var b = base();
      add(facetGroup("Collection", SECTIONS.map(function (s) { return [s.key, s.label]; }),
        "section", state.section, CAT, function (x, v) { return x.section === v; }));
      add(facetGroup("Beat", byCount(b, "section_name"),
        "beat", state.beat, b, function (x, v) { return x.section_name === v; }));
      add(facetGroup("Category", byCount(b, "category"),
        "cat", state.cat, b, function (x, v) { return x.category === v; }));
      add(facetGroup("Year", Object.keys(countBy(b, "year")).sort().reverse().map(function (y) { return [y, y]; }),
        "year", state.year, b, function (x, v) { return x.year === v; }));
      function add(g) { if (g) facets.appendChild(g); }
    }
    function facetGroup(title, opts, key, cur, pool, match) {
      var g = el("div", "facet"), any = false;
      g.appendChild(el("h4", null, title));
      opts.forEach(function (o) {
        var n = pool.filter(function (x) { return match(x, o[0]); }).length;
        if (!n) return;
        any = true;
        var b = el("button", cur === o[0] ? "on" : null);
        b.appendChild(el("span", null, o[1])); b.appendChild(el("span", "n", String(n)));
        b.onclick = function () {
          if (key === "section") {
            state.section = state.section === o[0] ? "" : o[0];
            state.type = ""; state.year = ""; state.beat = ""; state.cat = ""; state.tag = "";
          } else state[key] = state[key] === o[0] ? "" : o[0];
          apply();
        };
        g.appendChild(b);
      });
      return any ? g : null;
    }
    function drawMain(list) {
      main.innerHTML = "";
      var bar = el("div", "results-bar");
      bar.appendChild(el("span", "rcount", list.length + (list.length === 1 ? " title" : " titles")));
      var sel = el("select", "sortsel");
      [["new", "Newest first"], ["old", "Oldest first"], ["az", "Title A–Z"]].forEach(function (o) {
        var op = el("option", null, o[1]); op.value = o[0]; if (o[0] === state.sort) op.selected = true; sel.appendChild(op);
      });
      sel.onchange = function () { state.sort = sel.value; apply(); };
      bar.appendChild(sel); main.appendChild(bar);
      var active = el("div", "activef");
      [["type", TYPE[state.type] || state.type], ["year", state.year],
       ["beat", state.beat], ["cat", state.cat], ["tag", state.tag]].forEach(function (p) {
        if (!state[p[0]]) return;
        var t = el("span", "ftag", p[1] + "  ×"); t.onclick = function () { state[p[0]] = ""; apply(); };
        active.appendChild(t);
      });
      main.appendChild(active);
      if ((state.beat || state.cat) && state.section !== "gazettes") {
        main.appendChild(el("p", "facet-note",
          "Beats and categories are recorded for gazettes only, so this shelf leaves out the booklets and broadsheets."));
      }
      main.appendChild(list.length ? grid(list) : el("p", "empty", "Nothing matches those filters."));
    }
    apply(); setView(box);
  }

  function viewSearch(q) {
    var box = el("div");
    box.appendChild(headLine("Search", q ? "“" + q + "”" : ""));
    var res = q ? search(q) : [];
    var bar = el("div", "results-bar");
    bar.appendChild(el("span", "rcount", q ? (res.length + " result" + (res.length === 1 ? "" : "s")) : "Type to search the whole stand"));
    box.appendChild(bar);
    box.appendChild(res.length ? grid(res) : el("p", "empty", q ? "Nothing found. Try a title, author, tag or year." : ""));
    announce(q ? (res.length + " result" + (res.length === 1 ? "" : "s") + " for " + q) : "");
    setView(box);
  }

  function viewLibrary() {
    var box = el("div");
    box.appendChild(headLine("My Library", USER ? "@" + USER : "kept on this device"));
    var items = Array.from(LIB).map(function (id) { return BY_ID[id]; }).filter(Boolean).sort(byDate);
    if (!items.length) {
      var e = el("div", "empty");
      e.appendChild(document.createTextNode("Tap the star on any cover to save it to your shelf."));
      var cta = el("button", "btn-dl", USER ? "Browse the stand" : "Create an account");
      cta.onclick = function () { USER ? go("#/browse") : openAcct("up"); };
      e.appendChild(el("br")); e.appendChild(cta); box.appendChild(e);
    } else {
      box.appendChild(el("div", "results-bar")).appendChild(el("span", "rcount", items.length + " saved"));
      box.appendChild(grid(items));
    }
    announce("My Library — " + items.length + " saved");
    setView(box);
  }

  function viewDownloads() {
    var box = el("div");
    box.appendChild(headLine("My Downloads", "kept on this device" + (USER ? " · logged as @" + USER : "")));
    var seen = {}, items = [];
    DLS.slice().reverse().forEach(function (d) { if (!seen[d.id] && BY_ID[d.id]) { seen[d.id] = 1; items.push(BY_ID[d.id]); } });
    if (!items.length) box.appendChild(el("p", "empty", "Nothing downloaded yet. Open a book and hit Download to keep it here."));
    else { box.appendChild(el("div", "results-bar")).appendChild(el("span", "rcount", items.length + " downloaded")); box.appendChild(grid(items)); }
    announce("My Downloads — " + items.length + " kept on this device");
    setView(box);
  }

  function continueReading() {
    return Object.keys(READS).map(function (id) { return [id, READS[id]]; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .filter(function (p) { return progressOf(p[0]) < 0.95; }).slice(0, 12)
      .map(function (p) { return BY_ID[p[0]]; }).filter(Boolean);
  }

  function toggleSave(x, btn) {
    if (LIB.has(x.id)) LIB.delete(x.id); else LIB.add(x.id);
    persistLib();
    var on = LIB.has(x.id);
    if (btn) { btn.classList.toggle("on", on); btn.textContent = on ? "★" : "☆"; }
    renderAcct();
    if (location.hash.indexOf("#/library") === 0) viewLibrary();
    toast(on ? "Saved to your library" : "Removed from library");
  }

  var focusStack = [];
  var FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),iframe,[tabindex]";
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (n) {
      return n.tabIndex !== -1 && !n.hidden && !(n.closest && n.closest("[hidden]") && n.closest("[hidden]") !== root);
    });
  }
  function trapOpen(root, first) {
    var i = indexOfTrap(root);
    if (i < 0) focusStack.push({ root: root, from: document.activeElement });
    document.body.style.overflow = "hidden";
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 30);
  }
  function indexOfTrap(root) {
    for (var i = 0; i < focusStack.length; i++) if (focusStack[i].root === root) return i;
    return -1;
  }
  function trapClose(root) {
    var i = indexOfTrap(root);
    if (i < 0) return;
    var e = focusStack.splice(i, 1)[0];
    if (!focusStack.length) document.body.style.overflow = "";
    if (e.from && e.from.focus && document.body.contains(e.from)) { try { e.from.focus(); } catch (err) {} }
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !focusStack.length) return;
    var top = focusStack[focusStack.length - 1], f = focusables(top.root);
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!top.root.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });

  var rdItem = null, rdFrame = null, rdScrollHandler = null, rdPoll = 0;
  var rdFrom = "#/";   
  var stage = function () { return $("#rd-stage"); };
  function setReaderTheme(t) {
    var s = stage(); s.className = "rd-stage theme-" + t;
    Array.prototype.forEach.call($("#rd-themes").children, function (b) { b.classList.toggle("on", b.dataset.theme === t); });
    localStorage.setItem("ve_reader_theme", t);
  }
  var RD_SIZE = { s: "94%", m: "108%", l: "126%" };
  function sizeGroup() { return $("#rd-size"); }
  function readerSize() { var v = localStorage.getItem("ve_reader_size"); return RD_SIZE[v] ? v : "m"; }
  function setReaderSize(v) {
    if (!RD_SIZE[v]) v = "m";
    localStorage.setItem("ve_reader_size", v);
    var g = sizeGroup();
    if (g) Array.prototype.forEach.call(g.children, function (b) { b.classList.toggle("on", b.dataset.size === v); });
    applyReaderSize();
  }
  function applyReaderSize() {
    if (!rdFrame) return;
    try {
      var d = rdFrame.contentDocument;
      if (!d || !d.head) return;
      var s = d.getElementById("ve-rd-size");
      if (!s) { s = d.createElement("style"); s.id = "ve-rd-size"; d.head.appendChild(s); }
      s.textContent = ":root{font-size:" + RD_SIZE[readerSize()] + "}";
    } catch (e) {  }
  }
  function openReader(x, fromRoute) {
    if (!x) return;
    if (!fromRoute) {
      if (location.hash.indexOf("#/read/") !== 0) rdFrom = location.hash || "#/";
      go("#/read/" + x.id);
      return;
    }
    rdItem = x;
    $("#rd-type").textContent = TYPE[x.type] || x.type;
    $("#rd-title").textContent = x.title;
    syncReaderSave();
    var st = stage(); st.innerHTML = ""; $("#rd-progbar").style.width = "0";
    var rdUrl = x.read_url || x.url, rdExt = x.read_ext || x.ext;
    if (rdExt === "epub") {
      var fb = el("div", "rd-fallback");
      fb.appendChild(document.createTextNode("ePub books read best in a dedicated reader."));
      var b = el("button", "btn-dl", "Download the ePub"); b.style.maxWidth = "260px";
      b.onclick = function () { downloadItem(x); }; fb.appendChild(b); st.appendChild(fb);
    } else {
      var f = document.createElement("iframe");
      f.src = rdUrl; f.title = x.title;
      f.onload = function () { hookProgress(f); applyReaderSize(); hookSelection(f); };
      st.appendChild(f); rdFrame = f;
    }
    setReaderTheme(localStorage.getItem("ve_reader_theme") || "paper");
    setReaderSize(readerSize());
    READS[x.id] = Date.now(); localStorage.setItem(uk("ve_reads_"), JSON.stringify(READS));
    logEvent("read", x, 0);
    $("#reader").hidden = false;
    trapOpen($("#reader"), $("#rd-back"));
  }
  function hookProgress(f) {
    try {
      var w = f.contentWindow, d = f.contentDocument; if (!w || !d) return;
      if (rdScrollHandler) try { w.removeEventListener("scroll", rdScrollHandler); } catch (e) {}
      var id = rdItem && rdItem.id, saveT = 0;
      var want = id ? progressOf(id) : 0;
      if (want > 0.01 && want < 0.95) {
        var maxr = (d.documentElement.scrollHeight || 0) - w.innerHeight;
        if (maxr > 0) { try { w.scrollTo(0, Math.round(want * maxr)); } catch (e) {} }
      }
      rdScrollHandler = function () {
        var max = (d.documentElement.scrollHeight || 0) - w.innerHeight;
        if (!(max > 0)) return;
        var frac = Math.min(1, Math.max(0, w.scrollY / max));
        $("#rd-progbar").style.width = (frac * 100) + "%";
        if (!id) return;
        POS[id] = frac;
        clearTimeout(saveT);
        saveT = setTimeout(savePos, 700);
      };
      w.addEventListener("scroll", rdScrollHandler, { passive: true });
      clearInterval(rdPoll);
      rdPoll = setInterval(rdScrollHandler, 1200);
      rdScrollHandler();
    } catch (e) {  }
  }
  var annotSel = "";
  var NOTES = {};
  function loadNotes() {
    try { NOTES = JSON.parse(localStorage.getItem(uk("ve_notes_")) || "{}") || {}; }
    catch (e) { NOTES = {}; }
  }
  function saveNotes() {
    try { localStorage.setItem(uk("ve_notes_"), JSON.stringify(NOTES)); } catch (e) {}
  }
  function notesFor(id) { return (NOTES[id] || []).slice(); }
  function addNote(id, q, note) {
    if (!id) return;
    (NOTES[id] = NOTES[id] || []).push({ q: q, note: note, t: new Date().toISOString() });
    saveNotes();
  }
  function dropNote(id, t) {
    NOTES[id] = (NOTES[id] || []).filter(function (n) { return n.t !== t; });
    if (!NOTES[id].length) delete NOTES[id];
    saveNotes();
  }
  function annotEls() {
    return { box: $("#rd-annot"), q: $("#rd-annot-q"), note: $("#rd-annot-note"),
             go: $("#rd-annot-go"), x: $("#rd-annot-x"), st: $("#rd-annot-status") };
  }
  function closeAnnot() {
    var e = annotEls(); if (!e.box) return;
    e.box.hidden = true; annotSel = "";
    if (e.note) e.note.value = "";
    if (e.st) { e.st.textContent = "Kept on this device. Share it later if you want to."; e.st.className = "rd-annot-status"; }
  }
  function hookSelection(f) {
    var e = annotEls(); if (!e.box) return;
    closeAnnot();
    var d;
    try { d = f.contentDocument; } catch (err) { return; }
    if (!d) return;
    d.addEventListener("mouseup", onSel, { passive: true });
    d.addEventListener("keyup", onSel, { passive: true });
    d.addEventListener("touchend", onSel, { passive: true });
    var scT;
    d.addEventListener("selectionchange", function () {
      clearTimeout(scT); scT = setTimeout(onSel, 150);
    }, { passive: true });
    function onSel() {
      var s;
      try { s = f.contentWindow.getSelection(); } catch (err) { return; }
      var t = s ? String(s).trim().replace(/\s+/g, " ") : "";
      if (t.length < 4) {
        if (!e.note.value.trim()) closeAnnot();
        return;
      }
      annotSel = t.slice(0, 500);
      e.q.textContent = annotSel.length > 240 ? annotSel.slice(0, 240) + "…" : annotSel;
      e.box.hidden = false;
    }
  }
  (function wireAnnot() {
    var e = annotEls(); if (!e.box) return;
    e.x.onclick = closeAnnot;
    e.box.onsubmit = function (ev) {
      ev.preventDefault();
      var note = e.note.value.trim();
      if (!annotSel) { closeAnnot(); return; }
      if (!note) { e.st.className = "rd-annot-status err"; e.st.textContent = "Write the note first."; return; }
      addNote(rdItem ? rdItem.id : "", annotSel, note);
      closeAnnot();
      toast("Saved to your notes");
    };
  })();

  function savePos() { try { localStorage.setItem(uk("ve_pos_"), JSON.stringify(POS)); } catch (e) {} }
  function closeReader() {
    if (!rdItem) return;
    if (rdScrollHandler) { try { rdScrollHandler(); } catch (e) {} }   
    clearInterval(rdPoll); rdPoll = 0; rdScrollHandler = null;
    savePos(); closeAnnot();
    $("#reader").hidden = true; trapClose($("#reader"));
    stage().innerHTML = ""; rdFrame = null; rdItem = null;
  }
  function exitReader() { go(rdFrom || "#/"); }
  function syncReaderSave() {
    var b = $("#rd-save"), on = rdItem && LIB.has(rdItem.id);
    b.classList.toggle("on", !!on); b.innerHTML = on ? "★" : "☆";
  }
  $("#rd-back").onclick = exitReader;
  $("#rd-save").onclick = function () { if (rdItem) { toggleSave(rdItem); syncReaderSave(); } };
  $("#rd-dl").onclick = function () { if (rdItem) downloadItem(rdItem); };
  $("#rd-support").onclick = function () { if (rdItem) openPay(rdItem); };
  Array.prototype.forEach.call($("#rd-themes").children, function (b) {
    b.onclick = function () { setReaderTheme(b.dataset.theme); };
  });
  if (sizeGroup()) Array.prototype.forEach.call(sizeGroup().children, function (b) {
    b.onclick = function () { setReaderSize(b.dataset.size); };
  });

  function openModal(x) { if (x) go("#/pub/" + x.id); }

  function metaLine(x) {
    var bits = [];
    if (x.date) bits.push(x.date);
    if (x.reading_time) bits.push(x.reading_time + " min read");
    if (x.article_count > 1 || (x.contents || []).length > 1) {
      bits.push((x.contents || []).length || x.article_count);
      bits[bits.length - 1] += " pieces";
    }
    bits.push((x.ext || "").toUpperCase());
    if (x.size) bits.push(Math.max(1, Math.round(x.size / 1024)) + " KB");
    return bits.filter(Boolean).join("  ·  ");
  }

  function viewPub(id) {
    var x = BY_ID[id];
    if (!x) { toast("That publication is not on the shelf"); return viewHome(); }
    var box = el("div", "pub");

    var head = el("div", "pub-head");
    var cw = el("div", "pub-coverwrap");
    if (x.cover) {
      var im = el("img", "pub-cover"); im.src = x.cover; im.alt = ""; im.decoding = "async";
      cw.appendChild(im);
    }
    var pr = progressOf(x.id);
    if (pr > 0.01) {
      var pw = el("div", "card-prog" + (pr >= 0.95 ? " done" : ""));
      var pb = el("span"); pb.style.width = Math.min(100, Math.round(pr * 100)) + "%";
      pw.appendChild(pb); cw.appendChild(pw);
    }
    head.appendChild(cw);

    var info = el("div", "pub-info");
    info.appendChild(el("div", "pub-type", TYPE[x.type] || x.type));
    info.appendChild(el("h1", "pub-title", x.title));
    if (x.byline) info.appendChild(el("p", "pub-byline", x.byline));
    if (x.series) {
      var sl = el("a", "pub-series", x.series.label +
        (x.series.period_label ? " · " + x.series.period_label : ""));
      sl.href = "#/series/" + x.series.key; sl.dataset.go = "";
      info.appendChild(sl);
    }
    if (x.description) info.appendChild(el("p", "pub-desc", x.description));
    info.appendChild(el("div", "pub-meta", metaLine(x)));
    function browseLink(cls, param, value) {
      var a = el("a", cls, value);
      a.href = "#/browse?" + param + "=" + encodeURIComponent(value);
      a.dataset.go = "";
      a.title = "Browse everything filed under " + value;
      return a;
    }
    if (x.section_name || x.category) {
      var beat = el("div", "pub-beat");
      if (x.section_name) beat.appendChild(browseLink("pub-beat-b", "beat", x.section_name));
      if (x.category) beat.appendChild(browseLink(null, "cat", x.category));
      info.appendChild(beat);
    }
    if ((x.tags || []).length) {
      var tg = el("div", "m-tags");
      x.tags.slice(0, 12).forEach(function (t) { tg.appendChild(browseLink(null, "tag", t)); });
      info.appendChild(tg);
    }

    var acts = el("div", "m-actions");
    var read = el("button", "btn-dl", pr >= 0.95 ? "Read again" : pr > 0.01 ? "Resume" : "Read now");
    read.onclick = function () { openReader(x); };
    var dl = el("button", "btn-ghost", "Download");
    dl.onclick = function () { downloadItem(x); };
    var sv = el("button", "btn-save" + (LIB.has(x.id) ? " on" : ""), LIB.has(x.id) ? "★" : "☆");
    sv.title = "Save to your library";
    sv.setAttribute("aria-pressed", LIB.has(x.id) ? "true" : "false");
    sv.onclick = function () {
      toggleSave(x);
      var on = LIB.has(x.id);
      sv.classList.toggle("on", on); sv.innerHTML = on ? "★" : "☆";
      sv.setAttribute("aria-pressed", on ? "true" : "false");
    };
    acts.appendChild(read); acts.appendChild(dl); acts.appendChild(sv);

    var liked = LIKED.has(x.id);
    var lk = el("button", "btn-like" + (liked ? " on" : ""));
    function paintLike() {
      var n = LIKES[x.id] || 0;
      lk.textContent = (LIKED.has(x.id) ? "♥" : "♡") + (n > 0 ? " " + n : "");
      lk.title = LIKED.has(x.id) ? "You marked this" : "Mark this";
      lk.setAttribute("aria-pressed", LIKED.has(x.id) ? "true" : "false");
      lk.setAttribute("aria-label", n > 0
        ? "Mark this — " + n + (n === 1 ? " reader has" : " readers have") + " marked it"
        : "Mark this");
    }
    paintLike();
    lk.onclick = function () {
      if (LIKED.has(x.id)) { toast("You have already marked this"); return; }
      LIKED.add(x.id); persistLiked();
      LIKES[x.id] = (LIKES[x.id] || 0) + 1;      
      lk.classList.add("on"); paintLike();
      if (!API) return;
      jsonp({ action: "like_add", target_kind: "publication", target_ref: x.id })
        .then(function (d) {                      
          if (d && typeof d.count === "number") { LIKES[x.id] = d.count; paintLike(); }
        })
        .catch(function () {});
    };
    acts.appendChild(lk);
    info.appendChild(acts);

    var sup = el("button", "m-supportline", "Support The Voice Express ♡");
    sup.onclick = function () { openPay(x); };
    info.appendChild(sup);
    info.appendChild(el("p", "m-note", "Free to take. Pay if you'd like."));
    head.appendChild(info);
    box.appendChild(head);

    if ((x.contents || []).length) {
      box.appendChild(headLine("Inside this collection", x.contents.length + " pieces"));
      var toc = el("ol", "toc");
      x.contents.forEach(function (it) {
        var li = el("li", "toc-i");
        li.appendChild(el("span", "toc-d", it.date || ""));
        var t = el("span", "toc-t", it.title);
        li.appendChild(t);
        if (it.subtitle) li.appendChild(el("span", "toc-s", it.subtitle));
        toc.appendChild(li);
      });
      box.appendChild(toc);
    }

    box.appendChild(myNotes(x));
    box.appendChild(marginalia(x));

    var more = [];
    if (x.series) {
      more = CAT.filter(function (o) {
        return o.id !== x.id && o.series && o.series.key === x.series.key;
      }).sort(byDate).slice(0, 12);
    }
    if (!more.length && (x.tags || []).length) {
      more = CAT.filter(function (o) {
        return o.id !== x.id && (o.tags || []).some(function (t) { return x.tags.indexOf(t) > -1; });
      }).sort(byDate).slice(0, 12);
    }
    if (more.length) {
      var r = row(x.series ? "More from " + x.series.label : "Related", more,
        x.series ? "#/series/" + x.series.key : null);
      if (r) box.appendChild(r);
    }

    announce(x.title);
    setView(box);
  }

  function relTime(iso) {
    var t = Date.parse(iso || "");
    if (!t) return "";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return "just now";
    var m = s / 60; if (m < 60) return Math.round(m) + " min ago";
    var h = m / 60; if (h < 24) return Math.round(h) + (Math.round(h) === 1 ? " hour ago" : " hours ago");
    var d = h / 24; if (d < 30) return Math.round(d) + (Math.round(d) === 1 ? " day ago" : " days ago");
    try { return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return (iso || "").slice(0, 10); }
  }

  function myNotes(x) {
    var wrap = el("section", "mynotes");
    var mine = notesFor(x.id);
    if (!mine.length) { wrap.hidden = true; return wrap; }
    wrap.appendChild(headLine("Your notes", mine.length === 1 ? "private to this device"
                                                             : mine.length + " · private to this device"));
    mine.sort(function (a, b) { return (a.t || "") < (b.t || "") ? -1 : 1; });
    mine.forEach(function (n) {
      var e = el("article", "mynote");
      e.appendChild(el("blockquote", "marg-q", n.q));
      e.appendChild(el("p", "marg-b", n.note));
      var bar = el("div", "mynote-bar");
      bar.appendChild(el("span", "marg-when", relTime(n.t)));
      var share = el("button", "mynote-act", "Share publicly");
      share.title = "Post this as a comment. An editor reads it before it appears.";
      share.onclick = function () {
        if (!API) { toast("Sharing needs the backend configured"); return; }
        share.disabled = true; share.textContent = "Sending…";
        jsonp({ action: "comments_add", target_kind: "publication", target_ref: x.id,
                display_name: USER || "A reader", username: USER || "",
                selected_text: n.q, content: n.note })
          .then(function (d) {
            if (d && d.ok === false) { share.disabled = false; share.textContent = "Share publicly"; toast(d.error || "That did not send"); return; }
            share.textContent = "Sent for review";
            toast("Shared — an editor will read it first");
          })
          .catch(function () {
            share.disabled = false; share.textContent = "Share publicly";
            toast("Could not send that just now");
          });
      };
      var del = el("button", "mynote-act mynote-del", "Delete");
      del.onclick = function () { dropNote(x.id, n.t); route(); toast("Note deleted"); };
      bar.appendChild(share); bar.appendChild(del);
      e.appendChild(bar);
      wrap.appendChild(e);
    });
    return wrap;
  }

  function marginalia(x) {
    var wrap = el("section", "marg");
    wrap.appendChild(headLine("Marginalia", "notes from other readers"));

    if (!API) {
      wrap.appendChild(el("p", "marg-off",
        "Reader notes need the backend configured. Everything else on this page works offline."));
      return wrap;
    }

    var list = el("div", "marg-list");
    list.appendChild(el("p", "marg-empty", "Reading…"));
    wrap.appendChild(list);

    function paint(items) {
      list.innerHTML = "";
      if (!items.length) {
        list.appendChild(el("p", "marg-empty",
          "No one has written in the margins yet. Be the first."));
        return;
      }
      items.forEach(function (c) {
        var e = el("article", "marg-i" + (c.selected_text ? " marg-note" : ""));
        var hd = el("div", "marg-hd");
        var who = String(c.username || "").trim();
        hd.appendChild(el("span", "marg-who", who ? "@" + who : (c.display_name || "A reader")));
        var when = relTime(c.created_at || c.time);
        if (when) hd.appendChild(el("span", "marg-when", when));
        e.appendChild(hd);
        if (c.selected_text) e.appendChild(el("blockquote", "marg-q", c.selected_text));
        e.appendChild(el("p", "marg-b", c.content || c.note || ""));
        list.appendChild(e);
      });
    }

    jsonp({ action: "comments_get", target_kind: "publication", target_ref: x.id })
      .then(function (d) { paint(Array.isArray(d) ? d : []); })
      .catch(function () {
        list.innerHTML = "";
        list.appendChild(el("p", "marg-empty",
          "Could not reach the notes just now. They are still there — try again in a moment."));
      });

    var form = el("form", "marg-form");
    var nameI = null;
    if (!USER) {
      nameI = el("input", "marg-name");
      nameI.type = "text"; nameI.placeholder = "your name"; nameI.maxLength = 60;
      nameI.setAttribute("aria-label", "Your name");
      form.appendChild(nameI);
    }
    var body = el("textarea", "marg-body");
    body.placeholder = USER ? "Write in the margin, @" + USER + "…" : "Write in the margin…";
    body.maxLength = 2000; body.rows = 3;
    body.setAttribute("aria-label", "Your note");
    form.appendChild(body);

    var bar = el("div", "marg-bar");
    var send = el("button", "btn-dl marg-send", "Leave a note");
    send.type = "submit";
    bar.appendChild(send);
    bar.appendChild(el("span", "marg-note-s", "Held for the editor before it appears."));
    form.appendChild(bar);
    var status = el("p", "marg-status");
    form.appendChild(status);

    form.onsubmit = function (ev) {
      ev.preventDefault();
      var who = USER || (nameI ? nameI.value.trim() : "");
      var text = body.value.trim();
      if (!who) { status.className = "marg-status err"; status.textContent = "Add a name so readers know who wrote this."; return; }
      if (!text) { status.className = "marg-status err"; status.textContent = "Write something first."; return; }
      send.disabled = true; status.className = "marg-status"; status.textContent = "Sending…";
      jsonp({ action: "comments_add", target_kind: "publication", target_ref: x.id,
              display_name: who, username: USER || "", content: text })
        .then(function (d) {
          send.disabled = false;
          if (d && d.ok === false) { status.className = "marg-status err"; status.textContent = d.error || "That did not send."; return; }
          body.value = "";
          status.className = "marg-status ok";
          status.textContent = "Thank you — the editor will read it before it appears.";
          toast("Note sent");
        })
        .catch(function () {
          send.disabled = false;
          status.className = "marg-status err";
          status.textContent = "Could not send that just now. Your words are still in the box — try again.";
        });
    };
    wrap.appendChild(form);
    return wrap;
  }

  function keepOffline(x) {
    try {
      var sw = navigator.serviceWorker;
      if (!sw || !sw.controller || !x.url) return;
      sw.controller.postMessage({ type: "cache-download", url: x.url });
    } catch (e) {}
  }
  function downloadItem(x) {
    var a = document.createElement("a"); a.href = x.url; a.download = x.file; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    DLS.push({ id: x.id, file: x.file, title: x.title, t: new Date().toISOString() });
    localStorage.setItem(uk("ve_dls_"), JSON.stringify(DLS));
    keepOffline(x);
    logEvent("download", x, 0);
    toast("Downloading — " + x.title);
  }

  var payItem = null;
  function openPay(x) {
    payItem = x;
    $("#pay-sub").textContent = x ? "For “" + x.title + "”" : "";
    $("#p-cur").textContent = CUR;
    var amt = $("#p-amt"); amt.value = (x && x.price_sugg) || 0; amt.min = (x && x.price_min) || 0;
    buildPayChips(x);
    amt.oninput = function () { renderRails(); };
    renderRails(); buildPayFoot();
    $("#pay").hidden = false;
    trapOpen($("#pay"), $("#p-amt"));
  }
  function closePay() { $("#pay").hidden = true; trapClose($("#pay")); payItem = null; }
  function payAmount() { return Math.max(0, +($("#p-amt").value) || 0); }
  function buildPayChips(x) {
    var box = $("#p-chips"); box.innerHTML = "";
    var opts = [{ l: "Free", v: 0 }, { l: CUR + "50", v: 50 }, { l: CUR + "100", v: 100 }, { l: CUR + "250", v: 250 }];
    if (x && x.price_sugg) opts.push({ l: "Suggested " + CUR + x.price_sugg, v: x.price_sugg });
    opts.forEach(function (o) {
      var c = el("button", "chip", o.l);
      c.onclick = function () { $("#p-amt").value = o.v; renderRails(); };
      box.appendChild(c);
    });
  }
  function rails() {
    var a = payAmount(), title = payItem ? payItem.title : BRAND, out = [];
    (PAY.kofi || []).forEach(function (k) {
      if (k && k.url) out.push({ label: k.label || "Ko-fi", url: k.url, qr: k.url });
    });
    if (PAY.upi) {
      var uri = "upi://pay?pa=" + encodeURIComponent(PAY.upi) + "&pn=" + encodeURIComponent(BRAND) +
        "&cu=" + (CFG.currency || "INR") + "&tn=" + encodeURIComponent(title);
      out.push({ label: "UPI · " + PAY.upi, url: uri, qr: uri, show: PAY.upi });
    }
    if (PAY.paypal) {
      var pp = PAY.paypal;
      if (/paypal\.me/i.test(pp) && a) pp = pp.replace(/\/+$/, "") + "/" + a;
      else if (a) pp += (pp.indexOf("?") > -1 ? "&" : "?") + "amount=" + a;
      out.push({ label: "PayPal", url: pp, qr: pp });
    }
    if (PAY.razorpay) {
      var rp = PAY.razorpay.replace(/\/+$/, "");
      if (a) {
        if (/razorpay\.me\//i.test(rp)) rp += "/" + Math.round(a);
        else rp += (rp.indexOf("?") > -1 ? "&" : "?") + "amount=" + Math.round(a * 100);
      }
      out.push({ label: "Card · UPI · Razorpay", url: rp, qr: rp });
    }
    return out;
  }
  function renderRails() {
    var box = $("#pay-rails"); box.innerHTML = "";
    var list = rails();
    if (!list.length) { box.appendChild(el("p", "pay-empty", "No paid rails configured yet — leave hearts or a note below.")); return; }
    list.forEach(function (r) {
      var row = el("div", "rail");
      var main = el("div", "rail-main");
      main.appendChild(el("div", "rail-label", r.label));
      var lr = el("div", "rail-linkrow");
      var inp = el("input", "rail-link"); inp.value = r.show || r.url; inp.readOnly = true;
      inp.onclick = function () { inp.select(); };
      var cp = el("button", "rail-copy", "Copy");
      cp.onclick = function () {
        copy(r.url); cp.textContent = "Copied"; cp.classList.add("done");
        setTimeout(function () { cp.textContent = "Copy"; cp.classList.remove("done"); }, 1400);
      };
      lr.appendChild(inp); lr.appendChild(cp); main.appendChild(lr);
      var open = el("a", "rail-open", "Open " + r.label + " ↗");
      open.href = r.url; open.target = "_blank"; open.rel = "noopener";
      open.onclick = function () { if (payItem) logEvent("pay", payItem, payAmount(), r.label); };
      main.appendChild(open);
      row.appendChild(main);
      var qrwrap = el("div", "rail-qr");
      var img = el("img"); img.loading = "lazy"; img.alt = r.label + " QR"; img.src = qr(r.qr);
      qrwrap.appendChild(img); row.appendChild(qrwrap);
      box.appendChild(row);
    });
  }
  function buildPayFoot() {
    var foot = $(".pay-foot"); foot.innerHTML = "";
    if (PAY.hearts !== false) {
      var h = el("button", "btn-ghost", "♥ Pay in hearts (free)");
      h.onclick = function () { giveHeart(); if (payItem) logEvent("pay", payItem, 0, "hearts"); };
      foot.appendChild(h);
    }
    if (PAY.message !== false) {
      var m = el("button", "btn-ghost", "Send a cute message");
      m.onclick = function () { closePay(); openMsg(); };
      foot.appendChild(m);
    }
  }
  function giveHeart() {
    var n = (+localStorage.getItem("ve_hearts") || 0) + 1; localStorage.setItem("ve_hearts", n);
    toast("Thank you ♥  (" + n + " heart" + (n === 1 ? "" : "s") + " given)");
  }
  $("#pay-x").onclick = closePay;
  $("#pay").addEventListener("click", function (e) { if (e.target.id === "pay") closePay(); });

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { toast("Link copied"); }, fallbackCopy.bind(null, text));
    fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var t = el("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); try { document.execCommand("copy"); toast("Link copied"); } catch (e) {} t.remove();
  }

  function openMsg() { $("#msg-status").textContent = ""; $("#msg-status").className = "acct-msg"; $("#msg-body").value = ""; $("#msg").hidden = false; trapOpen($("#msg"), $("#msg-body")); }
  function closeMsg() { $("#msg").hidden = true; trapClose($("#msg")); }
  $("#msg-x").onclick = closeMsg;
  $("#msg").addEventListener("click", function (e) { if (e.target.id === "msg") closeMsg(); });
  $("#msg-go").onclick = function () {
    var body = ($("#msg-body").value || "").trim(), from = ($("#msg-from").value || "").trim();
    var st = $("#msg-status");
    if (!body) { st.className = "acct-msg err"; st.textContent = "Write a line first ♥"; return; }
    if (!API) { st.className = "acct-msg err"; st.textContent = "Messaging needs the backend configured."; return; }
    st.className = "acct-msg"; st.textContent = "…";
    jsonp({ action: "message", from: from || USER || "anon", body: body, ref: (payItem ? payItem.title : "") })
      .then(function (d) {
        if (d && d.ok) { st.className = "acct-msg ok"; st.textContent = "Sent — thank you ♥"; setTimeout(closeMsg, 900); }
        else { st.className = "acct-msg err"; st.textContent = "Could not send. Try again."; }
      }).catch(function () { st.className = "acct-msg err"; st.textContent = "Network error. Try again."; });
  };

  var acctMode = "in";
  function openAcct(mode) {
    acctMode = mode || "in";
    $("#tab-in").classList.toggle("on", acctMode === "in");
    $("#tab-up").classList.toggle("on", acctMode === "up");
    $("#acct-note").textContent = acctMode === "up"
      ? "No password — pick a unique handle. Your shelf travels with it."
      : "Welcome back. Enter your handle to load your shelf.";
    $("#acct-msg").textContent = ""; $("#acct-msg").className = "acct-msg";
    $("#acct-user").value = ""; $("#acctmodal").hidden = false;
    trapOpen($("#acctmodal"), $("#acct-user"));
  }
  function closeAcct() { $("#acctmodal").hidden = true; trapClose($("#acctmodal")); }
  $("#acct-x").onclick = closeAcct;
  $("#acctmodal").addEventListener("click", function (e) { if (e.target.id === "acctmodal") closeAcct(); });
  $("#tab-in").onclick = function () { openAcct("in"); };
  $("#tab-up").onclick = function () { openAcct("up"); };
  $("#acct-user").addEventListener("keydown", function (e) { if (e.key === "Enter") $("#acct-go").click(); });
  $("#acct-go").onclick = function () {
    var u = ($("#acct-user").value || "").trim(), msg = $("#acct-msg");
    if (!/^[A-Za-z0-9_.-]{2,40}$/.test(u)) { msg.className = "acct-msg err"; msg.textContent = "2–40 chars: letters, numbers, _ . -"; return; }
    if (!API) { msg.className = "acct-msg err"; msg.textContent = "Accounts need the backend configured."; return; }
    msg.className = "acct-msg"; msg.textContent = "…";
    jsonp({ action: acctMode === "up" ? "signup" : "login", username: u }).then(function (d) {
      if (!d || !d.ok) {
        msg.className = "acct-msg err";
        msg.textContent = d && d.error === "taken" ? "That handle is taken." :
          d && d.error === "nouser" ? "No such handle — create it?" : "Could not sign in.";
        return;
      }
      signIn(d.username || u, d.library || []);
      msg.className = "acct-msg ok"; msg.textContent = "Signed in."; setTimeout(closeAcct, 500);
    }).catch(function () { msg.className = "acct-msg err"; msg.textContent = "Network error. Try again."; });
  };
  function signIn(u, serverLib) {
    var anon = Array.from(LIB);
    USER = u; localStorage.setItem("ve_user", u);
    LIB = new Set(serverLib.concat(anon)); DLS = loadArr(uk("ve_dls_")); READS = loadMap(uk("ve_reads_")); POS = loadMap(uk("ve_pos_"));
    persistLib(); renderAcct(); toast("Welcome, @" + u); route();
  }
  function signOut() { USER = ""; localStorage.removeItem("ve_user"); reloadLocal(); renderAcct(); toast("Signed out"); route(); }
  function reloadLocal() { LIB = loadSet(uk("ve_lib_")); DLS = loadArr(uk("ve_dls_")); READS = loadMap(uk("ve_reads_")); POS = loadMap(uk("ve_pos_")); loadNotes(); }

  function renderAcct() {
    var box = $("#acct"); box.innerHTML = "";
    if (USER) {
      var chip = el("button", "acct-chip", "@" + USER + " ▾");
      var menu = el("div", "acct-menu");
      function mi(label, fn) { var b = el("button", null, label); b.onclick = function () { menu.classList.remove("on"); fn(); }; menu.appendChild(b); }
      mi("My Library (" + LIB.size + ")", function () { go("#/library"); });
      mi("My Downloads", function () { go("#/downloads"); });
      mi("Sign out", signOut);
      chip.onclick = function (e) { e.stopPropagation(); menu.classList.toggle("on"); };
      box.appendChild(chip); box.appendChild(menu);
    } else {
      var b = el("button", "acct-chip", "Sign in"); b.onclick = function () { openAcct("in"); };
      box.appendChild(b);
    }
  }
  document.addEventListener("click", function () { var m = $(".acct-menu"); if (m) m.classList.remove("on"); });

  function logRef() {
    var segs = (location.hash || "#/").replace(/^#/, "").split("?")[0].split("/").filter(Boolean);
    if (segs[0] === "pub" || segs[0] === "read" || segs[0] === "series") segs = [segs[0]];
    return "/" + segs.join("/");
  }
  function logEvent(kind, x, amt, via) {
    if (!API) return;
    var p = new URLSearchParams({ action: "log", kind: kind, t: new Date().toISOString(),
      title: x ? x.title : "", file: x ? x.file : "", type: x ? x.type : "", amount: amt || 0,
      currency: CFG.currency || "", via: via || "", ref: logRef(), user: USER || "" });
    var url = API + (API.indexOf("?") > -1 ? "&" : "?") + p.toString();
    fetch(url, { mode: "no-cors" }).catch(function () { new Image().src = url; });
  }

  var tT;
  function toast(m) { var t = $("#toast"); t.textContent = m; t.classList.remove("act"); t.onclick = null; t.classList.add("on"); clearTimeout(tT); tT = setTimeout(function () { t.classList.remove("on"); }, 2600); }

  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  var suppressRoute = false;
  function setHashQuiet(hash) {
    if (location.hash === hash) return;
    suppressRoute = true;
    location.hash = hash;
  }
  function route() {
    var h = (location.hash || "#/").replace(/^#/, ""), parts = h.split("?");
    var segs = parts[0].split("/").filter(Boolean), query = new URLSearchParams(parts[1] || "");

    if (segs[0] === "read") {
      var it = BY_ID[segs[1] || ""];
      if (!app.firstChild) viewHome();   
      if (it) { if (!rdItem || rdItem.id !== it.id) openReader(it, true); return; }
      closeReader(); toast("That publication is no longer on the shelf");
      return viewHome();
    }
    closeReader();

    if (segs[0] !== "search") $("#search").value = "";

    setNav(segs[0] || "home", segs[1] || "");
    if (segs[0] === "pub") return viewPub(segs[1] || "");
    if (segs[0] === "series") return viewSeries(segs[1] || "");
    if (segs[0] === "browse") return viewBrowse(segs[1] || "", query);
    if (segs[0] === "search") { $("#search").value = query.get("q") || ""; return viewSearch(query.get("q") || ""); }
    if (segs[0] === "library") return viewLibrary();
    if (segs[0] === "downloads") return viewDownloads();
    return viewHome();
  }
  window.addEventListener("hashchange", function () {
    if (suppressRoute) { suppressRoute = false; return; }
    route();
  });
  function buildNav() {
    var nav = $("#nav"); nav.innerHTML = "";
    function link(label, hash) {
      var a = el("a", null, label);
      a.href = hash; a.dataset.hash = hash; a.dataset.go = "";
      nav.appendChild(a);
    }
    link("Home", "#/"); link("Browse", "#/browse");
    SECTIONS.forEach(function (s) {
      if (s.count === 0) return;
      link(s.label, "#/browse/" + s.key);
    });
    link("My Library", "#/library"); link("Downloads", "#/downloads");
  }
  function setNav(view, sub) {
    var want = view === "home" ? "#/" : view === "browse" ? (sub ? "#/browse/" + sub : "#/browse") :
      view === "library" ? "#/library" : view === "downloads" ? "#/downloads" : "";
    Array.prototype.forEach.call($("#nav").children, function (a) { a.classList.toggle("on", a.dataset.hash === want); });
  }

  var sT;
  function wireSearch() {
    $("#search").addEventListener("input", function (e) {
      var q = e.target.value; clearTimeout(sT);
      sT = setTimeout(function () {
        if (!q.trim()) { if (location.hash.indexOf("#/search") === 0) go("#/"); return; }
        if (location.hash.indexOf("#/search") === 0) viewSearch(q.trim());
        else location.hash = "#/search?q=" + encodeURIComponent(q.trim());
      }, 180);
    });
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-go]");
    if (a) { e.preventDefault(); go(a.getAttribute("href")); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("#msg").hidden) return closeMsg();
    if (!$("#pay").hidden) return closePay();
    if (!$("#acctmodal").hidden) return closeAcct();
    if (!$("#reader").hidden) return exitReader();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (!$("#reader").hidden) return;
    e.preventDefault(); $("#search").focus(); $("#search").select();
  });

  function init(generated) {
    app = $("#app");
    reloadLocal();
    $("#foot-meta").textContent = CAT.length + " publications  ·  updated " +
      (generated || "").slice(0, 10) + "  ·  " + BRAND + " — " + (CFG.tagline || "Truth Takes Time");
    buildNav(); renderAcct(); wireSearch();
    if (USER && API) jsonp({ action: "getlib", username: USER }).then(function (d) {
      if (d && d.ok) { LIB = new Set(d.library.concat(Array.from(LIB))); persistLib(); renderAcct(); if (location.hash.indexOf("#/library") === 0) route(); }
    }).catch(function () {});
    if (API) jsonp({ action: "likes_all" }).then(function (d) {
      if (!d || !d.counts) return;
      LIKES = d.counts;
      route();
    }).catch(function () {});
    route();
    registerSW();
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js", { scope: "./" }).then(function (reg) {
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            var t = $("#toast");
            toast("Update ready — tap to refresh");
            t.classList.add("act");
            t.onclick = function () { t.classList.remove("act"); t.onclick = null; nw.postMessage("skipWaiting"); };
          }
        });
      });
    }).catch(function () {});
    var refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
})();
