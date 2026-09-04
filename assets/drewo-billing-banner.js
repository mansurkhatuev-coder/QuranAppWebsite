/**
 * Billing banner on family-tree pages (view stays open; edits blocked by server).
 * Expects access.json billing + optional /trees/billing-config.js
 */
(function () {
  function ensureBanner() {
    let el = document.getElementById('billing-banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'billing-banner';
    el.className = 'billing-banner';
    el.hidden = true;
    el.innerHTML =
      '<div class="billing-banner-copy">' +
      '<strong id="billing-banner-title">Нужно продлить доступ</strong>' +
      '<p id="billing-banner-text"></p>' +
      '</div>' +
      '<div class="billing-banner-actions">' +
      '<a id="billing-whatsapp" class="billing-wa-btn" target="_blank" rel="noopener noreferrer">Продлить в WhatsApp</a>' +
      '<a id="billing-sbp" class="billing-sbp-btn" hidden href="#">Оплатить по СБП</a>' +
      '</div>';
    const lock = document.getElementById('lock-banner');
    if (lock && lock.parentNode) {
      lock.parentNode.insertBefore(el, lock.nextSibling);
    } else {
      document.body.appendChild(el);
    }
    return el;
  }

  function injectStyles() {
    if (document.getElementById('billing-banner-style')) return;
    const style = document.createElement('style');
    style.id = 'billing-banner-style';
    style.textContent =
      '.billing-banner{display:none;margin:10px 14px 0;padding:12px 14px;border-radius:14px;' +
      'background:rgba(180,90,76,.1);border:1px solid rgba(180,90,76,.28);color:#5c2f28;' +
      'font-family:inherit;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}' +
      '.billing-banner.visible{display:flex}' +
      '.billing-banner strong{display:block;font-size:15px}' +
      '.billing-banner p{margin:4px 0 0;font-size:13px;line-height:1.4;opacity:.92}' +
      '.billing-banner-actions{display:flex;flex-wrap:wrap;gap:8px}' +
      '.billing-wa-btn,.billing-sbp-btn{display:inline-flex;align-items:center;justify-content:center;' +
      'padding:8px 12px;border-radius:999px;background:#128c7e;color:#fff;text-decoration:none;font-size:13px;font-weight:600}' +
      '.billing-sbp-btn{background:#1f4b7a}' +
      'body.view-locked .billing-banner{display:none!important}';
    document.head.appendChild(style);
  }

  function treeMeta() {
    const dir = typeof window.TREE_DIR === 'string' ? window.TREE_DIR : '';
    const title =
      document.getElementById('gate-title')?.textContent?.replace(/^Вход в\s+/i, '').trim() ||
      document.title ||
      dir;
    let code = '';
    try {
      const m = dir.match(/^drewo-(.+)$/);
      if (m) code = m[1];
    } catch (_) {}
    return { treeDir: dir, title, code };
  }

  function reconcile(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const billing = Object.assign({}, raw);
    const now = Date.now();
    if (billing.status === 'exempt' || billing.status === 'disabled') {
      /* keep */
    } else if (billing.status === 'trial' && billing.trialEndsAt && Date.parse(billing.trialEndsAt) <= now) {
      billing.status = 'expired';
    } else if (billing.status === 'active' && billing.paidUntil && Date.parse(billing.paidUntil) <= now) {
      billing.status = 'expired';
    }

    const hasAccess =
      billing.status === 'exempt' || billing.status === 'trial' || billing.status === 'active';
    let reason = 'ok';
    let label = '';
    let editBlockReason = '';
    if (billing.status === 'disabled') {
      reason = 'disabled';
      label = 'Древо отключено';
      editBlockReason = 'Древо отключено. Напишите в WhatsApp, чтобы восстановить доступ.';
    } else if (billing.status === 'expired') {
      reason = billing.lastPaymentAt ? 'subscription_expired' : 'trial_expired';
      label = reason === 'trial_expired' ? 'Пробный период закончился' : 'Нужно продлить';
      editBlockReason =
        reason === 'trial_expired'
          ? 'Пробный месяц закончился. Просмотр доступен — правки после оплаты.'
          : 'Срок оплаты закончился. Просмотр доступен — правки после продления.';
    } else if (billing.status === 'trial') {
      label = 'Пробный период';
    } else if (billing.status === 'active') {
      label = 'Оплачено';
    } else {
      label = 'Без оплаты';
    }

    return Object.assign({}, billing, {
      hasAccess,
      reason,
      label,
      editsBlocked: !hasAccess,
      editBlockReason,
    });
  }

  function applyBilling(rawBilling) {
    injectStyles();
    const banner = ensureBanner();
    const billing = reconcile(rawBilling);
    if (!billing || billing.status === 'exempt' || billing.hasAccess) {
      banner.hidden = true;
      banner.classList.remove('visible');
      return;
    }

    const titleEl = document.getElementById('billing-banner-title');
    const textEl = document.getElementById('billing-banner-text');
    const wa = document.getElementById('billing-whatsapp');
    const sbp = document.getElementById('billing-sbp');
    const meta = treeMeta();
    const cfg = window.DrewoBilling?.config?.() || {};

    if (titleEl) titleEl.textContent = billing.label || 'Нужно продлить доступ';
    if (textEl) {
      const price = billing.priceRub || cfg.priceRub || 790;
      const months = billing.periodMonths || cfg.periodMonths || 6;
      textEl.textContent =
        (billing.editBlockReason || 'Просмотр открыт. Правки — после оплаты.') +
        ` ${price} ₽ / ${months === 6 ? 'полгода' : months + ' мес'}.` +
        (billing.priceLocked ? ' Ваша цена сохранена.' : '');
    }

    if (wa && window.DrewoBilling) {
      wa.href = window.DrewoBilling.renewUrl({
        title: meta.title,
        treeDir: meta.treeDir,
        code: meta.code,
        priceRub: billing.priceRub,
        periodMonths: billing.periodMonths,
        reason: billing.reason,
      });
    }

    const sbpUrl = window.DrewoBilling?.sbpCheckoutUrl?.(meta);
    if (sbp) {
      if (sbpUrl) {
        sbp.hidden = false;
        sbp.href = sbpUrl;
      } else {
        sbp.hidden = true;
      }
    }

    banner.hidden = false;
    banner.classList.add('visible');
  }

  function boot() {
    injectStyles();
    ensureBanner();
    fetch('access.json?v=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (data && data.billing) applyBilling(data.billing);
      })
      .catch(function () {});
  }

  window.DrewoBillingBanner = { applyBilling: applyBilling, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
