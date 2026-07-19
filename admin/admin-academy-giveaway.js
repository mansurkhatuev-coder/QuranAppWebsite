/* global supabase, showToast */

(function () {
  const CAMPAIGN = 'tajweed_final_v1';

  function $(id) {
    return document.getElementById(id);
  }

  async function loadSettings() {
    const { data, error } = await supabase
      .from('academy_giveaway_settings')
      .select('active,prize_text,winners_target')
      .eq('campaign_id', CAMPAIGN)
      .maybeSingle();
    if (error) throw error;
    const active = $('giveaway-active');
    const prize = $('giveaway-prize');
    const winners = $('giveaway-winners');
    if (active) active.checked = data?.active === true;
    if (prize) prize.value = data?.prize_text || '';
    if (winners) winners.value = String(data?.winners_target || 3);
  }

  async function saveSettings() {
    const active = $('giveaway-active')?.checked === true;
    const prizeText = $('giveaway-prize')?.value?.trim() || null;
    const winnersTarget = Math.min(3, Math.max(1, Number($('giveaway-winners')?.value || 3)));
    const { error } = await supabase.from('academy_giveaway_settings').upsert({
      campaign_id: CAMPAIGN,
      active,
      prize_text: prizeText,
      winners_target: winnersTarget,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    showToast('Настройки розыгрыша сохранены');
  }

  async function loadEntries() {
    const q = ($('giveaway-search')?.value || '').trim();
    let query = supabase
      .from('academy_final_exam_entries')
      .select('id,code,display_name,phone,score_percent,status,created_at,client_id')
      .eq('campaign_id', CAMPAIGN)
      .order('created_at', { ascending: false })
      .limit(200);
    if (q) {
      query = query.or(`code.ilike.%${q}%,phone.ilike.%${q}%,display_name.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const list = $('giveaway-list');
    if (!list) return;
    const phoneCounts = {};
    for (const row of data || []) {
      phoneCounts[row.phone] = (phoneCounts[row.phone] || 0) + 1;
    }
    list.innerHTML = (data || [])
      .map((row) => {
        const dup = phoneCounts[row.phone] > 1 ? ' <em>(дубль телефона)</em>' : '';
        return `<article class="admin-card">
          <strong>${row.code}</strong> · ${row.display_name} · ${row.phone}${dup}<br/>
          ${row.score_percent}% · ${row.status} · ${new Date(row.created_at).toLocaleString()}
          <div class="admin-row" style="margin-top:8px;gap:8px">
            <button type="button" class="admin-button" data-winner="${row.id}">Победитель</button>
            <button type="button" class="admin-button" data-skip="${row.id}">Не выбран</button>
          </div>
          <p class="admin-muted">client: ${row.client_id} (одна заявка на устройство)</p>
        </article>`;
      })
      .join('') || '<p class="admin-muted">Заявок нет</p>';
  }

  async function setStatus(id, status) {
    const { error } = await supabase
      .from('academy_final_exam_entries')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
    await loadEntries();
  }

  function bind() {
    $('giveaway-save')?.addEventListener('click', () => {
      saveSettings().catch((err) => showToast(err.message || 'Ошибка сохранения', true));
    });
    $('giveaway-refresh')?.addEventListener('click', () => {
      Promise.all([loadSettings(), loadEntries()]).catch((err) =>
        showToast(err.message || 'Ошибка загрузки', true)
      );
    });
    $('giveaway-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadEntries().catch(() => {});
    });
    $('giveaway-list')?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.dataset.winner) setStatus(t.dataset.winner, 'winner').catch(() => {});
      if (t.dataset.skip) setStatus(t.dataset.skip, 'not_selected').catch(() => {});
    });
  }

  window.initAcademyGiveawayAdmin = function initAcademyGiveawayAdmin() {
    bind();
    return Promise.all([loadSettings(), loadEntries()]);
  };
})();
