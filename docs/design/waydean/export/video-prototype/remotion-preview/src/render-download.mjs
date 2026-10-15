export function pipeRenderDownload(stream, response, onUnavailable) {
  stream.once("error", error => {
    void Promise.resolve()
      .then(() => onUnavailable(error))
      .catch(() => {})
      .finally(() => response.destroy());
  });
  stream.pipe(response);
  return stream;
}
