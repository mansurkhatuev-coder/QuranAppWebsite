// Session-scoped object URLs with bounded parallel loading; nothing is persisted.
export function createPrivatePhotoCache({ request, makeUrl, revokeUrl, limit = 3 }) {
  const urls = new Map(), pending = new Map(), queue = [];
  let generation = 0, running = 0;
  function pump() {
    while (running < limit && queue.length) {
      const job = queue.shift();
      if (job.generation !== generation) { job.resolve(null); continue; }
      running++;
      Promise.resolve().then(job.load).then(result => {
        if (job.generation !== generation || !result) return null;
        const url = makeUrl(result);
        if (url) urls.set(job.key, url);
        return url || null;
      }).catch(() => null).then(job.resolve).finally(() => {
        if (pending.get(job.key) === job.promise) pending.delete(job.key);
        running--; pump();
      });
    }
  }
  return {
    get: key => urls.get(key) || null,
    load(key, payload) {
      if (urls.has(key)) return Promise.resolve(urls.get(key));
      if (pending.has(key)) return pending.get(key);
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      const job = { key, generation, promise, resolve, load: () => request(payload) };
      pending.set(key, promise); queue.push(job); pump();
      return promise;
    },
    clear() {
      generation++;
      for (const url of urls.values()) revokeUrl(url);
      urls.clear(); pending.clear();
      while (queue.length) queue.shift().resolve(null);
    }
  };
}
export function photoResponseBlob(result, { personId, variant }, decode = atob) {
  if (result?.personId !== personId || result.variant !== variant ||
      !['image/jpeg','image/webp'].includes(result.contentType) ||
      typeof result.contentBase64 !== 'string' || result.contentBase64.length > 1_200_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.contentBase64)) return null;
  try {
    const binary = decode(result.contentBase64);
    if (!binary.length || binary.length > 900_000) return null;
    return new Blob([Uint8Array.from(binary, ch => ch.charCodeAt(0))], {type:result.contentType});
  } catch { return null; }
}
