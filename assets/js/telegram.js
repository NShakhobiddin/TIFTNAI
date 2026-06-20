/* ============================================================
   telegram.js — Telegram Mini App integration
   Makes the app fill the whole Telegram window (fullscreen +
   safe-area aware). No-op in a normal browser.
   ============================================================ */
(function () {
  "use strict";
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;

  var root = document.documentElement;
  root.classList.add("tg");

  function px(n) { return (n || 0) + "px"; }

  function applyInsets() {
    try {
      var sa = tg.contentSafeAreaInset || tg.safeAreaInset || {};
      root.style.setProperty("--tg-top", px(sa.top));
      root.style.setProperty("--tg-bottom", px(sa.bottom));
      var h = tg.viewportStableHeight || tg.viewportHeight;
      if (h) root.style.setProperty("--tg-h", px(h));
    } catch (e) { /* ignore */ }
  }

  try {
    tg.ready();
    if (tg.expand) tg.expand();
    // Bot API 8.0+ — true fullscreen (hides Telegram's own chrome).
    if (tg.requestFullscreen) { try { tg.requestFullscreen(); } catch (e) {} }
    if (tg.setHeaderColor) tg.setHeaderColor("#0e2545");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#0e2545");
    if (tg.setBottomBarColor) { try { tg.setBottomBarColor("#f4f6fb"); } catch (e) {} }
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
  } catch (e) { /* ignore */ }

  // Keep insets/height in sync with Telegram events.
  ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged", "fullscreenChanged"].forEach(function (ev) {
    try { tg.onEvent(ev, applyInsets); } catch (e) {}
  });
  applyInsets();
  setTimeout(applyInsets, 300);

  // Sync Telegram's Back button with the app's in-screen back button.
  try {
    if (tg.BackButton) {
      tg.BackButton.onClick(function () {
        var b = document.querySelector('#app button');
        if (b) b.click();
      });
      var sync = function () {
        var el = document.querySelector('#app [data-screen-label]');
        var label = el ? el.getAttribute("data-screen-label") : "";
        var root2 = ["Splash", "Dashboard", "Hisoblashlar", "Saqlangan", "Profil"];
        if (root2.indexOf(label) === -1) tg.BackButton.show(); else tg.BackButton.hide();
      };
      var app = document.getElementById("app");
      if (app && window.MutationObserver) new MutationObserver(sync).observe(app, { childList: true });
      setInterval(sync, 700);
    }
  } catch (e) { /* ignore */ }
})();
