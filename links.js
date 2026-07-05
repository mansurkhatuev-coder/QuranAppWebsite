/** Production links — edit before uploading to hosting. Do not commit real URLs if private. */
const LINKS = {
  /** Canonical site URL for SEO (no trailing slash). Update when using a custom domain. */
  siteUrl: 'https://waydean.ru',
  rustore: 'https://www.rustore.ru/catalog/app/com.sheyhmansur.quranapp',
  apk: 'https://github.com/mansurkhatuev-coder/QuranAppWebsite/releases/download/v1.0.6/koran-i-azkary-1.0.6.apk',
  appStore: 'https://apps.apple.com/app/id6782619598',
  supportEmail: 'ne.kradi@mail.ru',
  supportTelegram: '',
  appVersion: '1.0.6',
  appVersionCode: 7,
  appPackage: 'com.sheyhmansur.quranapp',
  /** Yandex Metrika counter ID (numeric). Leave empty until the counter is created. */
  yandexMetrikaId: '110287110',
  /** JavaScript goal identifier for the share button in Metrika. */
  yandexMetrikaGoal: 'share_site',
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LINKS };
}
