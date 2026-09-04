/**
 * Billing helpers for Trees hub + family-tree pages.
 * Depends on optional window.DREWO_BILLING.
 */
(function (root) {
  const DEFAULTS = {
    whatsappPhone: '',
    priceRub: 790,
    periodMonths: 6,
    periodLabel: '6 месяцев',
    trialDays: 30,
    supportNote:
      'Оплата нужна на развитие и поддержку проекта. Ваша цена фиксируется для этого древа.',
    sbpEnabled: false,
    sbpCheckoutUrl: '',
  };

  function config() {
    return Object.assign({}, DEFAULTS, root.DREWO_BILLING || {});
  }

  function normalizePhoneForWhatsApp(phone) {
    if (!phone) return null;
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`;
    if (digits.length < 10) return null;
    return digits;
  }

  function buildWhatsAppUrl(phone, text) {
    const normalized = normalizePhoneForWhatsApp(phone);
    if (!normalized) {
      return text ? `https://wa.me/?text=${encodeURIComponent(text)}` : 'https://wa.me/';
    }
    const base = `https://wa.me/${normalized}`;
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
  }

  function renewText(opts) {
    const cfg = config();
    const price = opts.priceRub != null ? opts.priceRub : cfg.priceRub;
    const months = opts.periodMonths != null ? opts.periodMonths : cfg.periodMonths;
    const period = months === 6 ? 'полгода' : `${months} мес.`;
    const why =
      opts.reason === 'trial_expired'
        ? 'Пробный премиум закончился — хочу снова полный режим.'
        : opts.reason === 'disabled'
          ? 'Древо отключено.'
          : 'Хочу продлить премиум.';
    return [
      'Здравствуйте! Хочу премиум для семейного древа.',
      why,
      `Древо: ${opts.title || opts.treeDir || ''}`,
      `Код: ${opts.code || opts.treeDir || ''}`,
      `Тариф: ${price} ₽ / ${period}`,
      cfg.supportNote || 'Оплата нужна на развитие и поддержку проекта.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function renewUrl(opts) {
    const cfg = config();
    return buildWhatsAppUrl(cfg.whatsappPhone, renewText(opts));
  }

  /** Future SBP entry point — no-op until sbpEnabled. */
  function sbpCheckoutUrl(opts) {
    const cfg = config();
    if (!cfg.sbpEnabled || !cfg.sbpCheckoutUrl) return null;
    try {
      const url = new URL(cfg.sbpCheckoutUrl, root.location?.origin || 'https://waydean.ru');
      if (opts.treeDir) url.searchParams.set('tree', opts.treeDir);
      if (opts.code) url.searchParams.set('code', opts.code);
      return url.toString();
    } catch {
      return null;
    }
  }

  root.DrewoBilling = {
    config,
    normalizePhoneForWhatsApp,
    buildWhatsAppUrl,
    renewText,
    renewUrl,
    sbpCheckoutUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
