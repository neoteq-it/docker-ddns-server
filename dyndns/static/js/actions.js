/* =========================================================================
   NEOTEQ DynDNS — front-end behaviour (vanilla JS, no dependencies)
   ========================================================================= */
(function () {
    "use strict";

    var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

    function on(sel, event, handler) {
        $$(sel).forEach(function (el) { el.addEventListener(event, handler); });
    }

    function go(url) { window.location.href = url; }

    /* ---- Copy to clipboard (modern API with a legacy fallback) ---------- */
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
        } else {
            legacyCopy(text);
        }
    }
    function legacyCopy(text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) { /* no-op */ }
        document.body.removeChild(ta);
    }

    function flash(btn) {
        if (!btn) return;
        btn.classList.add("copied");
        setTimeout(function () { btn.classList.remove("copied"); }, 900);
    }

    /* ---- REST helpers --------------------------------------------------- */
    function errorMessage(res) {
        return res.json().then(
            function (data) { return (data && data.message) || res.statusText; },
            function () { return res.statusText; }
        );
    }

    function sendDelete(url, redirect) {
        fetch(url, { method: "GET", headers: { "X-Requested-With": "fetch" } })
            .then(function (res) {
                if (res.ok) { go(redirect); return; }
                errorMessage(res).then(function (msg) {
                    alert("Error: " + msg);
                    window.location.reload();
                });
            })
            .catch(function (err) { alert("Error: " + err.message); });
    }

    /* ---- Hosts ---------------------------------------------------------- */
    on(".addHost", "click", function () { go("/admin/hosts/add"); });
    on(".editHost", "click", function () { go("/admin/hosts/edit/" + this.dataset.id); });
    on(".showHostLog", "click", function () { go("/admin/logs/host/" + this.dataset.id); });
    on(".deleteHost", "click", function () {
        if (!confirm("Delete this host and its DNS record?")) return;
        sendDelete("/admin/hosts/delete/" + this.dataset.id, "/admin/hosts");
    });

    /* ---- CNames --------------------------------------------------------- */
    on(".addCName", "click", function () { go("/admin/cnames/add"); });
    on(".deleteCName", "click", function () {
        if (!confirm("Delete this CNAME alias?")) return;
        sendDelete("/admin/cnames/delete/" + this.dataset.id, "/admin/cnames");
    });

    /* ---- Copy the ready-to-use update URL ------------------------------- */
    on(".copyUrl", "click", function () {
        var d = this.dataset;
        var url = window.location.protocol + "//" + d.user.trim() + ":" + d.pass.trim() +
            "@" + d.domain + "/update?hostname=" + d.fqdn;
        copyText(url);
        flash(this);
    });

    /* ---- Form submit (add / edit host, add cname) ----------------------- */
    on(".js-submit", "click", function (e) {
        e.preventDefault();
        var btn = this;
        var type = btn.dataset.type;         // "hosts" | "cnames"
        var action = btn.dataset.action;     // "add" | "edit"
        var url = "/admin/" + type + "/" + action;
        if (action === "edit") { url += "/" + btn.dataset.id; }

        var form = $("#editHostForm");
        var body = new URLSearchParams(new FormData(form)).toString();

        fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
            body: body
        }).then(function (res) {
            if (res.ok) { go("/admin/" + type); return; }
            errorMessage(res).then(function (msg) { alert("Error: " + msg); });
        }).catch(function (err) { alert("Error: " + err.message); });
    });

    /* ---- Field helpers (copy value, generate credential) ---------------- */
    on(".copyField", "click", function () {
        var input = document.getElementById(this.dataset.target);
        if (input) { copyText(input.value); flash(this); }
    });

    function randomHash() {
        var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var out = "";
        var buf = new Uint32Array(16);
        (window.crypto || window.msCrypto).getRandomValues(buf);
        for (var i = 0; i < buf.length; i++) { out += chars[buf[i] % chars.length]; }
        return out;
    }
    on(".generateHash", "click", function () {
        var input = document.getElementById(this.dataset.target);
        if (input) { input.value = randomHash(); }
    });

    /* ---- CNAME target -> mirror the target domain ----------------------- */
    var targetSelect = $("#target_id");
    if (targetSelect) {
        targetSelect.addEventListener("change", function () {
            var opt = this.options[this.selectedIndex];
            var mirror = $("#domain_mirror");
            if (mirror) { mirror.value = opt ? (opt.getAttribute("data-domain") || "") : ""; }
        });
    }

    /* ---- Logout: best-effort clearing of cached basic-auth -------------- */
    var logout = $("#logout");
    if (logout) {
        logout.addEventListener("click", function () {
            try {
                fetch(window.location.pathname, {
                    headers: { "Authorization": "Basic " + btoa("logout:logout") },
                    cache: "no-store"
                }).catch(function () {});
            } catch (e) { /* let the link navigate regardless */ }
        });
    }

    /* ---- Theme toggle --------------------------------------------------- */
    var toggle = $("#themeToggle");
    if (toggle) {
        toggle.addEventListener("click", function () {
            var root = document.documentElement;
            var current = root.getAttribute("data-theme");
            if (!current) {
                current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
            }
            var next = current === "dark" ? "light" : "dark";
            root.setAttribute("data-theme", next);
            try { localStorage.setItem("neoteq-theme", next); } catch (e) {}
        });
    }

    /* ---- Nav active state ----------------------------------------------- */
    var seg = window.location.pathname.split("/")[2] || "hosts";
    var active = $(".nav-" + seg);
    if (active) { active.classList.add("active"); }

    /* ---- Tooltip for log messages (renders HTML from data-tip) ---------- */
    var tip = null;
    function ensureTip() {
        if (!tip) {
            tip = document.createElement("div");
            tip.id = "tooltip";
            document.body.appendChild(tip);
        }
        return tip;
    }
    function moveTip(e) {
        if (!tip) return;
        var pad = 14;
        var x = e.clientX + pad;
        var y = e.clientY + pad;
        var r = tip.getBoundingClientRect();
        if (x + r.width > window.innerWidth) { x = e.clientX - r.width - pad; }
        if (y + r.height > window.innerHeight) { y = e.clientY - r.height - pad; }
        tip.style.left = x + "px";
        tip.style.top = y + "px";
    }
    $$(".has-tip").forEach(function (el) {
        el.addEventListener("mouseenter", function (e) {
            var t = ensureTip();
            t.innerHTML = el.getAttribute("data-tip") || "";
            t.classList.add("show");
            moveTip(e);
        });
        el.addEventListener("mousemove", moveTip);
        el.addEventListener("mouseleave", function () {
            if (tip) { tip.classList.remove("show"); }
        });
    });
})();
