/**
 * Question type registry (client). Server Edge scorers remain source of truth.
 * Start with 3 types; add renderers later without schema changes.
 */
(function (global) {
  function normalizeShortText(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ');
  }

  const registry = {
    single_choice: {
      label: 'Один вариант',
      answerShape: 'option_id',
      validatePayload(payload) {
        const options = payload?.options;
        if (!Array.isArray(options) || options.length < 2) {
          return 'Нужно минимум 2 варианта';
        }
        if (!payload.correct_option_id) return 'Не указан правильный вариант';
        return null;
      },
      /** Client-side preview only — live scoring is server-side. */
      previewScore(payload, answer) {
        return answer?.option_id === payload.correct_option_id;
      },
    },
    true_false: {
      label: 'Верно / неверно',
      answerShape: 'bool',
      validatePayload(payload) {
        if (typeof payload?.correct !== 'boolean') return 'Нужен correct: true|false';
        return null;
      },
      previewScore(payload, answer) {
        return Boolean(answer?.value) === Boolean(payload.correct);
      },
    },
    short_text: {
      label: 'Короткий ввод',
      answerShape: 'text',
      validatePayload(payload) {
        const accepted = payload?.accepted;
        if (!Array.isArray(accepted) || !accepted.length) {
          return 'Нужен список accepted[]';
        }
        return null;
      },
      previewScore(payload, answer) {
        const got = normalizeShortText(answer?.text);
        const list = (payload.accepted || []).map(normalizeShortText);
        return list.includes(got);
      },
    },
  };

  function get(type) {
    return registry[type] || null;
  }

  function listSupported() {
    return Object.keys(registry);
  }

  function isSupported(type) {
    return Boolean(registry[type]);
  }

  global.AcademyQuestionTypes = {
    registry,
    get,
    listSupported,
    isSupported,
    normalizeShortText,
  };
})(window);
