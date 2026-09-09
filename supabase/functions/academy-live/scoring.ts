/** Server-side question scorers (source of truth). */

export type ScoreResult =
  | { pending: true; score: null; is_correct: null }
  | { pending: false; score: number; is_correct: boolean };

function normalizeShortText(text: unknown): string {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

export function scoreAnswer(
  type: string,
  payload: Record<string, unknown>,
  answer: Record<string, unknown>,
  scoring: Record<string, unknown> | null | undefined,
): ScoreResult {
  const points = typeof scoring?.points === 'number' ? Number(scoring.points) : 1;

  if (type === 'single_choice' || type === 'image_choice') {
    const ok = String(answer?.option_id ?? '') === String(payload?.correct_option_id ?? '');
    return { pending: false, is_correct: ok, score: ok ? points : 0 };
  }

  if (type === 'true_false') {
    const ok = Boolean(answer?.value) === Boolean(payload?.correct);
    return { pending: false, is_correct: ok, score: ok ? points : 0 };
  }

  if (type === 'short_text') {
    const got = normalizeShortText(answer?.text);
    const accepted = Array.isArray(payload?.accepted)
      ? (payload.accepted as unknown[]).map(normalizeShortText)
      : [];
    const ok = accepted.includes(got);
    return { pending: false, is_correct: ok, score: ok ? points : 0 };
  }

  if (type === 'multi_choice') {
    const got = Array.isArray(answer?.option_ids)
      ? [...(answer.option_ids as unknown[])].map(String).sort()
      : [];
    const correct = Array.isArray(payload?.correct_option_ids)
      ? [...(payload.correct_option_ids as unknown[])].map(String).sort()
      : [];
    const ok = got.length === correct.length && got.every((id, i) => id === correct[i]);
    return { pending: false, is_correct: ok, score: ok ? points : 0 };
  }

  if (type === 'free_text') {
    return { pending: true, is_correct: null, score: null };
  }

  // Unknown future type: do not crash session; leave unscored.
  return { pending: true, is_correct: null, score: null };
}

/** Strip answer keys before sending a question to students. */
export function publicQuestion(
  q: Record<string, unknown>,
  opts: { reveal: boolean },
): Record<string, unknown> {
  const payload = { ...((q.payload as Record<string, unknown>) || {}) };
  if (!opts.reveal) {
    delete payload.correct_option_id;
    delete payload.correct_option_ids;
    delete payload.correct;
    delete payload.accepted;
    if (Array.isArray(payload.options)) {
      payload.options = (payload.options as Array<Record<string, unknown>>).map((o) => ({
        id: o.id,
        label: o.label,
      }));
    }
  }
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    prompt_media: q.prompt_media ?? null,
    payload,
    position: q.position ?? 0,
  };
}
