(() => {
  "use strict";

  function create(requestSave, { onFailure = () => {} } = {}) {
    if (typeof requestSave !== "function") throw new TypeError("Для перехода нужна функция сохранения.");
    let pending = false;

    return async function run(transition) {
      if (pending) return false;
      pending = true;
      try {
        let saved = false;
        try {
          saved = await requestSave();
        } catch (error) {
          onFailure(error);
          return false;
        }
        if (saved !== true) {
          onFailure();
          return false;
        }
        await transition();
        return true;
      } finally {
        pending = false;
      }
    };
  }

  window.AdminV2TransitionGuard = Object.freeze({ create });
})();
