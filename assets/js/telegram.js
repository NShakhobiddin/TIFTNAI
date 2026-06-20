/* ============================================================
   telegram.js — Telegram Mini App integration (optional)
   No-op when the app is opened in a normal browser.
   ============================================================ */
(function () {
  "use strict";
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData && !tg.platform) {
    // Not inside Telegram — nothing to do.
    if (!tg) return;
  }
  try {
    tg.ready();
    if (tg.expand) tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor("#0e2545");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#0e2545");
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    document.documentElement.classList.add("tg");
  } catch (e) { /* ignore */ }

  // Sync Telegram's hardware/back button with the app's in-screen back button.
  try {
    if (tg.BackButton) {
      var appBack = function () {
        var b = document.querySelector('#app [data-screen-label] button, #app button');
        if (b) b.click();
      };
      tg.BackButton.onClick(appBack);
      // Show the Back button unless we're on a root screen.
      var sync = function () {
        var label = (document.querySelector('#app [data-screen-label]') || {}).getAttribute
          ? document.querySelector('#app [data-screen-label]').getAttribute("data-screen-label") : "";
        var root = ["Splash", "Dashboard", "Hisoblashlar", "Saqlangan", "Profil"];
        if (root.indexOf(label) === -1) tg.BackButton.show(); else tg.BackButton.hide();
      };
      var mo = new MutationObserver(sync);
      var app = document.getElementById("app");
      if (app) mo.observe(app, { childList: true, subtree: false });
      setInterval(sync, 600);
    }
  } catch (e) { /* ignore */ }
})();
