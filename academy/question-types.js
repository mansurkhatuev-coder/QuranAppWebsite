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
    letter_grid: {
      label: 'Сетка букв',
      answerShape: 'letters',
      validatePayload(payload) {
        const letters = payload?.letters;
        const correct = payload?.correct_letters;
        if (!Array.isArray(letters) || letters.length < 4) return 'Нужна сетка букв';
        if (!Array.isArray(correct) || !correct.length) return 'Нужны верные буквы';
        return null;
      },
      previewScore(payload, answer) {
        const got = [...new Set((answer?.letters || []).map(String))].sort();
        const correct = [...new Set((payload?.correct_letters || []).map(String))].sort();
        return got.length === correct.length && got.every((v, i) => v === correct[i]);
      },
    },
    rule_choice: {
      label: 'Выбор правила',
      answerShape: 'rule_id',
      validatePayload(payload) {
        if (!String(payload?.word || '').trim()) return 'Нужно слово';
        const options = payload?.options;
        if (!Array.isArray(options) || options.length < 2) return 'Нужны варианты правил';
        if (!payload?.correct_rule_id) return 'Не указано верное правило';
        return null;
      },
      previewScore(payload, answer) {
        return String(answer?.rule_id || '') === String(payload?.correct_rule_id || '');
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
