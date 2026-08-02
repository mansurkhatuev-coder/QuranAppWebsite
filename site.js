(function applySiteLinks() {
  var yearEl = document.getElementById('copyright-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  if (typeof LINKS === 'undefined') return;

  var rustoreBtn = document.getElementById('btn-rustore');
  var apkBtn = document.getElementById('btn-apk');
  var appStoreBtn = document.getElementById('btn-appstore');

  if (rustoreBtn) {
    if (LINKS.rustore) {
      rustoreBtn.href = LINKS.rustore;
      rustoreBtn.rel = 'noopener noreferrer';
      rustoreBtn.removeAttribute('aria-disabled');
      rustoreBtn.classList.remove('btn-disabled');
    } else {
      rustoreBtn.removeAttribute('href');
      rustoreBtn.setAttribute('aria-disabled', 'true');
      rustoreBtn.classList.add('btn-disabled');
      var rustoreBadge = rustoreBtn.querySelector('.btn-badge');
      if (rustoreBadge) rustoreBadge.textContent = 'Скоро';
    }
  }

  if (apkBtn) {
    if (LINKS.apk) {
      apkBtn.href = LINKS.apk;
      apkBtn.rel = 'noopener noreferrer';
      apkBtn.setAttribute('download', '');
      apkBtn.removeAttribute('aria-disabled');
      apkBtn.classList.remove('btn-disabled');
    } else {
      apkBtn.removeAttribute('href');
      apkBtn.setAttribute('aria-disabled', 'true');
      apkBtn.classList.add('btn-disabled');
    }
  }

  if (appStoreBtn) {
    if (LINKS.appStore) {
      appStoreBtn.href = LINKS.appStore;
      appStoreBtn.rel = 'noopener noreferrer';
      appStoreBtn.removeAttribute('aria-disabled');
      appStoreBtn.classList.remove('btn-disabled');
      var appStoreBadge = appStoreBtn.querySelector('.btn-badge');
      if (appStoreBadge) appStoreBadge.remove();
    } else {
      appStoreBtn.removeAttribute('href');
      appStoreBtn.setAttribute('aria-disabled', 'true');
      appStoreBtn.classList.add('btn-disabled');
    }
  }

  function wireLinkButtons(selector, url, options) {
    document.querySelectorAll(selector).forEach(function (el) {
      if (url) {
        el.href = url;
        el.rel = 'noopener noreferrer';
        el.removeAttribute('aria-disabled');
        el.classList.remove('btn-disabled');
        if (options && options.download) {
          el.setAttribute('download', '');
        } else {
          el.removeAttribute('download');
        }
        if (!options || !options.keepBadge) {
          var badge = el.querySelector('.btn-badge');
          if (badge) badge.remove();
        }
      }
    });
  }

  wireLinkButtons('[data-link="rustore"]', LINKS.rustore);
  wireLinkButtons('[data-link="appstore"]', LINKS.appStore);
  wireLinkButtons('[data-link="apk"]', LINKS.apk, { download: true });

  var versionEl = document.getElementById('app-version');
  function setVersionLabel(version, code) {
    if (!versionEl || !version) return;
    versionEl.textContent = code ? version + ' (' + code + ')' : version;
  }
  if (versionEl && LINKS.appVersion) {
    setVersionLabel(LINKS.appVersion, LINKS.appVersionCode);
  }
  // Prefer live app-release.json (synced from admin / RuStore after publish).
  fetch('/data/app-release.json', { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data) return;
      var android = data.android || {};
      var ios = data.ios || {};
      var rustoreUrl = (android.rustore && android.rustore.url) || android.rustoreUrl;
      var apkUrl = (android.apk && android.apk.url) || android.apkUrl;
      var version = (android.rustore && android.rustore.latestVersion) || (android.apk && android.apk.latestVersion) || android.latestVersion || ios.latestVersion || LINKS.appVersion;
      var code = (android.rustore && android.rustore.versionCode) || (android.apk && android.apk.versionCode) || android.versionCode || ios.buildNumber || LINKS.appVersionCode;
      setVersionLabel(version, code);
      if (rustoreUrl && rustoreBtn) {
        rustoreBtn.href = rustoreUrl;
        rustoreBtn.rel = 'noopener noreferrer';
        rustoreBtn.removeAttribute('aria-disabled');
        rustoreBtn.classList.remove('btn-disabled');
      }
      if (apkUrl && apkBtn) {
        apkBtn.href = apkUrl;
        apkBtn.rel = 'noopener noreferrer';
        apkBtn.setAttribute('download', '');
        apkBtn.removeAttribute('aria-disabled');
        apkBtn.classList.remove('btn-disabled');
      }
      if (ios.appStoreUrl && appStoreBtn) {
        appStoreBtn.href = ios.appStoreUrl;
        appStoreBtn.rel = 'noopener noreferrer';
        appStoreBtn.removeAttribute('aria-disabled');
        appStoreBtn.classList.remove('btn-disabled');
      }
    })
    .catch(function () { /* keep LINKS fallback */ });

  var packageEl = document.getElementById('app-package');
  if (packageEl && LINKS.appPackage) {
    packageEl.textContent = LINKS.appPackage;
  }

  var emailEl = document.getElementById('support-email');
  if (emailEl && LINKS.supportEmail) {
    emailEl.href = 'mailto:' + LINKS.supportEmail;
    emailEl.textContent = LINKS.supportEmail;
  }

  var telegramRow = document.getElementById('support-telegram-row');
  var telegramEl = document.getElementById('support-telegram');
  if (telegramRow && telegramEl) {
    if (LINKS.supportTelegram) {
      telegramEl.href = LINKS.supportTelegram;
      telegramEl.textContent = LINKS.supportTelegram.replace(/^https?:\/\//, '');
    } else {
      telegramRow.hidden = true;
    }
  }
})();
