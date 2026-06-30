(function applySiteLinks() {
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
        var badge = el.querySelector('.btn-badge');
        if (badge) badge.remove();
      }
    });
  }

  wireLinkButtons('[data-link="rustore"]', LINKS.rustore);
  wireLinkButtons('[data-link="appstore"]', LINKS.appStore);
  wireLinkButtons('[data-link="apk"]', LINKS.apk, { download: true });

  var versionEl = document.getElementById('app-version');
  if (versionEl && LINKS.appVersion) {
    versionEl.textContent = LINKS.appVersionCode
      ? LINKS.appVersion + ' (' + LINKS.appVersionCode + ')'
      : LINKS.appVersion;
  }

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
