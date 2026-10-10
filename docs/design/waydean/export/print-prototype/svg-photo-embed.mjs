const imageTagPattern = /<image\b[^>]*>/g;
const hrefPattern = /\bhref=(['"])(.*?)\1/;

function decodeXmlAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function embedSvgImageAssets(svg, fetchImage) {
  const imageTags = svg.match(imageTagPattern) ?? [];
  const embeddedByHref = new Map();
  let result = svg;

  for (const imageTag of imageTags) {
    const hrefMatch = imageTag.match(hrefPattern);
    if (!hrefMatch) continue;

    const href = decodeXmlAttribute(hrefMatch[2]);
    if (href.startsWith("data:")) continue;

    let dataUri = embeddedByHref.get(href);
    if (!dataUri) {
      if (typeof fetchImage !== "function") throw new TypeError("A demo-image loader is required.");

      const response = await fetchImage(href);
      if (!response?.ok) throw new Error("Could not load demo image.");

      const contentType = response.headers?.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(contentType ?? "")) {
        throw new Error("Unsupported demo image type.");
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      dataUri = `data:${contentType};base64,${bytesToBase64(bytes)}`;
      embeddedByHref.set(href, dataUri);
    }

    const embeddedTag = imageTag.replace(hrefMatch[0], `href="${dataUri}"`);
    result = result.replace(imageTag, embeddedTag);
  }

  return result;
}
