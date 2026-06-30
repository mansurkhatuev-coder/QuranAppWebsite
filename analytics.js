(function initSiteAnalytics() {
  if (typeof LINKS === 'undefined') return;

  var counterId = parseInt(LINKS.yandexMetrikaId, 10);
  var shareGoal = LINKS.yandexMetrikaGoal || 'share_site';

  function initYandexMetrika() {
    if (!counterId) return;

    (function (m, e, t, r, i, k, a) {
      m[i] =
        m[i] ||
        function () {
          (m[i].a = m[i].a || []).push(arguments);
        };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) {
        if (document.scripts[j].src === r) return;
      }
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = 1;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

    window.ym(counterId, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    });
  }

  function reachShareGoal(method) {
    if (!counterId || typeof window.ym !== 'function') return;
    try {
      window.ym(counterId, 'reachGoal', shareGoal, { share_method: method });
    } catch (_err) {
      /* ignore analytics errors */
    }
  }

  function getSharePayload() {
    var url = LINKS.siteUrl || window.location.href;
    return {
      title: 'Коран и Азкары',
      text: 'Коран с переводом и тафсиром, азкары, намаз и кибла — без рекламы.',
      url: url,
    };
  }

  function showShareToast(message) {
    var existing = document.getElementById('share-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'share-toast';
    toast.className = 'share-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('share-toast--visible');
    });

    window.setTimeout(function () {
      toast.classList.remove('share-toast--visible');
      window.setTimeout(function () {
        toast.remove();
      }, 300);
    }, 2400);
  }

  function copyShareText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        var copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (copied) resolve();
        else reject(new Error('copy failed'));
      } catch (err) {
        document.body.removeChild(textarea);
        reject(err);
      }
    });
  }

  function handleShare() {
    var payload = getSharePayload();

    if (navigator.share) {
      navigator
        .share(payload)
        .then(function () {
          reachShareGoal('native');
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          return copyShareText(payload.text + '\n' + payload.url)
            .then(function () {
              reachShareGoal('copy');
              showShareToast('Ссылка скопирована');
            })
            .catch(function () {
              showShareToast('Не удалось поделиться');
            });
        });
      return;
    }

    copyShareText(payload.text + '\n' + payload.url)
      .then(function () {
        reachShareGoal('copy');
        showShareToast('Ссылка скопирована');
      })
      .catch(function () {
        showShareToast('Не удалось скопировать ссылку');
      });
  }

  document.querySelectorAll('[data-action="share"]').forEach(function (btn) {
    btn.addEventListener('click', handleShare);
  });

  initYandexMetrika();
})();
