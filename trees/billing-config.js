/**
 * Публичные настройки оплаты древ (WhatsApp сейчас, СБП позже).
 * Номер — международный без +, например 79001234567.
 */
window.DREWO_BILLING = {
  whatsappPhone: '',
  priceRub: 790,
  periodMonths: 6,
  periodLabel: '6 месяцев',
  trialDays: 30,
  /** Короткий текст для владельца древа */
  supportNote: 'Оплата нужна на развитие и поддержку проекта. Ваша цена фиксируется для этого древа.',
  /** Задел под СБП: пока false — только WhatsApp */
  sbpEnabled: false,
  sbpCheckoutUrl: '',
};
