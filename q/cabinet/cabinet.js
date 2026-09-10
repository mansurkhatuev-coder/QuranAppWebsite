(function () {
  const A = window.AcademyLive;
  const hello = document.getElementById('student-hello');
  const historyEmpty = document.getElementById('history-empty');
  const historyList = document.getElementById('history-list');
  const leaderboardCard = document.getElementById('leaderboard-card');
  const leaderboardBody = document.getElementById('leaderboard-body');
  const appError = document.getElementById('app-error');
  const btnLogout = document.getElementById('btn-logout');

  function showError(message) {
    appError.hidden = !message;
    appError.textContent = message || '';
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return String(value);
    }
  }

  async function boot() {
    if (!A.canCreateClient()) {
      showError('Сервис временно недоступен.');
      return;
    }
    const client = A.getStudentClient();
    const { data } = await client.auth.getSession();
    if (!data?.session) {
      location.replace('/q/auth/');
      return;
    }
    const accessToken = data.session.access_token;
    const user = data.session.user;
    try {
      const ensured = await A.callLive(
        'ensure_student',
        { display_name: user.user_metadata?.display_name || user.email || 'Ученик' },
        { accessToken }
      );
      hello.textContent = ensured?.student?.display_name || user.email || 'Ученик';
      const hist = await A.callLive('student_history', {}, { accessToken });
      const rows = hist.history || [];
      if (!rows.length) {
        historyEmpty.hidden = false;
        historyList.innerHTML = '';
      } else {
        historyEmpty.hidden = true;
        historyList.innerHTML = rows
          .map((row) => {
            const pct = row.answered
              ? Math.round((Number(row.correct) / Number(row.answered)) * 100) + '%'
              : '—';
            return `<li class="academy-history-item">
              <div>
                <strong>${A.escapeHtml(row.lesson_title)}</strong>
                <div class="academy-muted">${A.escapeHtml(formatDate(row.finished_at || row.started_at))} · ${A.escapeHtml(
                  A.labelStatus(row.status)
                )}</div>
              </div>
              <div class="academy-muted">${A.escapeHtml(String(row.correct))}/${A.escapeHtml(
                String(row.answered)
              )} · ${A.escapeHtml(pct)}</div>
            </li>`;
          })
          .join('');
      }

      const boards = hist.leaderboard || [];
      if (boards.length) {
        leaderboardCard.hidden = false;
        leaderboardBody.innerHTML = boards
          .map((board) => {
            const list = (board.rows || [])
              .map(
                (r, i) =>
                  `<li><span>${i + 1}. ${A.escapeHtml(r.display_name)}</span><span>${A.escapeHtml(
                    String(r.accuracy)
                  )}% · ${A.escapeHtml(String(r.runs))} пр.</span></li>`
              )
              .join('');
            return `<div style="margin-top:0.75rem">
              <strong>${A.escapeHtml(board.hub_title)}</strong>
              <ul class="q-leaderboard">${list || '<li class="academy-muted">Пока пусто</li>'}</ul>
            </div>`;
          })
          .join('');
      }
    } catch (err) {
      showError(A.humanizeError(err?.message || err, 'Не удалось загрузить кабинет.'));
    }
  }

  btnLogout.addEventListener('click', async () => {
    const client = A.getStudentClient();
    await client.auth.signOut();
    location.href = '/q/auth/';
  });

  boot();
})();
