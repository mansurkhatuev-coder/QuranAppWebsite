export type FileExportEnvironment = {
  appleMobile: boolean;
  canShareFiles: (file: File) => boolean;
  shareFile: (file: File) => Promise<void>;
  downloadFile: (file: File) => void;
};

export function isAppleMobileBrowser(input: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}) {
  return /iPhone|iPad|iPod/i.test(input.userAgent) ||
    (input.platform === "MacIntel" && input.maxTouchPoints > 1);
}

function isAbortError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

function browserEnvironment(): FileExportEnvironment {
  const shareSupported = typeof navigator.share === "function" &&
    typeof navigator.canShare === "function";

  return {
    appleMobile: isAppleMobileBrowser({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    }),
    canShareFiles: (file) => shareSupported && navigator.canShare({ files: [file] }),
    shareFile: async (file) => {
      if (!navigator.share) throw new Error("Sharing is unavailable");
      await navigator.share({ title: file.name, files: [file] });
    },
    downloadFile: (file) => {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}

export async function deliverExportFile(
  file: File,
  environment: FileExportEnvironment = browserEnvironment()
): Promise<"shared" | "downloaded" | "cancelled"> {
  if (environment.appleMobile && environment.canShareFiles(file)) {
    try {
      await environment.shareFile(file);
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
    }
  }

  environment.downloadFile(file);
  return "downloaded";
}
