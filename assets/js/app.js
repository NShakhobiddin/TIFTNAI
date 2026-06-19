/* ============================================================
   Dekla AI — interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Header scroll state ---------- */
  var header = document.getElementById("header");
  var onScroll = function () {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 12);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav ---------- */
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("is-open");
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.14 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- Animated counters ---------- */
  var counters = document.querySelectorAll("[data-count]");
  var fmt = function (n) {
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(0) + "K";
    return String(n);
  };
  var runCounter = function (el) {
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    var dur = 1600, start = performance.now();
    var tick = function (now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.floor(target * eased));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(target);
    };
    requestAnimationFrame(tick);
  };
  if ("IntersectionObserver" in window && counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { runCounter(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(runCounter);
  }

  /* ---------- Pricing toggle ---------- */
  var toggleBtns = document.querySelectorAll(".toggle__btn");
  var amounts = document.querySelectorAll(".plan .amount");
  toggleBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      toggleBtns.forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var yearly = btn.getAttribute("data-plan") === "yearly";
      amounts.forEach(function (a) {
        var val = a.getAttribute(yearly ? "data-yearly" : "data-monthly");
        a.textContent = "$" + val;
      });
    });
  });

  /* ---------- Email forms ---------- */
  var validEmail = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); };
  var wireForm = function (formId, inputId, noteId) {
    var form = document.getElementById(formId);
    var input = document.getElementById(inputId);
    var note = document.getElementById(noteId);
    if (!form || !input) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var val = input.value.trim();
      if (!validEmail(val)) {
        input.classList.add("is-error");
        if (note) { note.textContent = "Please enter a valid email address."; note.classList.remove("is-success"); }
        input.focus();
        return;
      }
      input.classList.remove("is-error");
      input.value = "";
      input.placeholder = "You're on the list! 🎉";
      if (note) { note.textContent = "Thanks! Check your inbox to confirm your trial."; note.classList.add("is-success"); }
    });
    input.addEventListener("input", function () { input.classList.remove("is-error"); });
  };
  wireForm("ctaForm", "ctaEmail", "ctaNote");
  wireForm("ctaForm2", "ctaEmail2", "ctaNote2");

  /* ---------- Phone chat demo ---------- */
  var chat = document.getElementById("appChat");
  if (chat) {
    var script = [
      { from: "bot", text: "Hi! I'm Dekla 👋 How can I help today?" },
      { from: "user", text: "Plan a 3-day trip to Tokyo" },
      { from: "bot", text: "Sure! Day 1: Shibuya & Harajuku. Day 2: Asakusa & TeamLab. Day 3: day trip to Hakone. Want a budget?" },
      { from: "user", text: "Yes, around $800" },
      { from: "bot", text: "Done ✅ I built a $780 plan with hotels, transit & food. Sending it now…" }
    ];

    var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var i = 0;

    var addMsg = function (m) {
      var el = document.createElement("div");
      el.className = "msg msg--" + m.from;
      el.textContent = m.text;
      chat.appendChild(el);
      trim();
    };
    var addTyping = function () {
      var el = document.createElement("div");
      el.className = "msg msg--bot msg--typing";
      el.innerHTML = "<i></i><i></i><i></i>";
      chat.appendChild(el);
      return el;
    };
    var trim = function () {
      // keep the visible area tidy on the small screen
      while (chat.children.length > 5) chat.removeChild(chat.firstChild);
    };

    var step = function () {
      var m = script[i % script.length];
      if (m.from === "bot") {
        var t = addTyping();
        setTimeout(function () {
          if (t.parentNode) chat.removeChild(t);
          addMsg(m);
          i++;
          setTimeout(step, 2200);
        }, 1100);
      } else {
        addMsg(m);
        i++;
        setTimeout(step, 1500);
      }
    };

    if (prefersReduced) {
      script.slice(0, 3).forEach(addMsg);
    } else {
      setTimeout(step, 700);
    }
  }
})();
