/** Номер в международном формате без +, например 79001234567 */
export function getWhatsAppPhone() {
  return (process.env.NEXT_PUBLIC_WHATSAPP_PHONE || "").replace(/\D/g, "");
}

export function buildWhatsAppExtendUrl(orgName: string) {
  const phone = getWhatsAppPhone();
  const text = encodeURIComponent(
    `Здравствуйте! Хочу продлить доступ к Рассрочкам.\nОрганизация: ${orgName}`
  );
  if (!phone) {
    return `https://wa.me/?text=${text}`;
  }
  return `https://wa.me/${phone}?text=${text}`;
}
