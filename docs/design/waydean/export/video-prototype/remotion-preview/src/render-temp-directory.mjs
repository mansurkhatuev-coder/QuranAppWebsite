import path from "node:path";

export function configureRenderTempDirectory(env, systemTempDirectory) {
  const override = typeof env.WAYDEAN_EXPORT_TEMP_DIR === "string"
    ? env.WAYDEAN_EXPORT_TEMP_DIR.trim()
    : "";
  if (!override) return systemTempDirectory;

  const directory = path.resolve(override);
  env.TEMP = directory;
  env.TMP = directory;
  env.TMPDIR = directory;
  return directory;
}
