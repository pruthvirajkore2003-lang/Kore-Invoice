/* Shared share pipeline for the invoice and memo apps.
   Offline by construction: no libraries, no CDN, no network calls. The bill is
   rasterised locally through an SVG <foreignObject> snapshot and handed to the OS
   share sheet (WhatsApp sits at the top of it on Android). Every step degrades:
   file share -> text share -> WhatsApp link + print. */
(() => {
  "use strict";

  const RENDER_TIMEOUT_MS = 6000;
  const MAX_SCALE = 2;

  const collectCss = () => {
    const parts = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) parts.push(rule.cssText);
      } catch {
        /* Unreadable sheet (cross-origin). This app ships none, so nothing is lost. */
      }
    }
    return parts.join("\n");
  };

  /* An SVG used as an image cannot fetch anything, so same-origin <img> sources have
     to travel as data: URIs. The live element is already decoded, so the canvas copy
     is free and stays untainted (same-origin). */
  const inlineImages = (source, clone) => {
    const originals = Array.from(source.querySelectorAll("img"));
    const copies = Array.from(clone.querySelectorAll("img"));
    originals.forEach((original, index) => {
      const copy = copies[index];
      if (!copy) return;
      if ((copy.getAttribute("src") || "").startsWith("data:")) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = original.naturalWidth || original.width;
        canvas.height = original.naturalHeight || original.height;
        canvas.getContext("2d").drawImage(original, 0, 0, canvas.width, canvas.height);
        copy.setAttribute("src", canvas.toDataURL("image/png"));
      } catch {
        copy.removeAttribute("src"); // Better a gap than a broken-image glyph.
      }
    });
  };

  const buildSvgMarkup = (element, width, height) => {
    const clone = element.cloneNode(true);
    inlineImages(element, clone);
    clone.removeAttribute("id");
    clone.style.transform = "none";
    clone.style.margin = "0";
    clone.style.boxShadow = "none";

    const style = document.createElement("style");
    style.textContent = `${collectCss()}
      .invoice-shell, .memo-shell {
        width: ${width}px !important;
        min-width: ${width}px !important;
        max-width: ${width}px !important;
        height: ${height}px !important;
        min-height: ${height}px !important;
        margin: 0 !important;
        transform: none !important;
        box-shadow: none !important;
      }`;

    const wrapper = document.createElement("div");
    wrapper.className = document.body.className;
    wrapper.appendChild(style);
    wrapper.appendChild(clone);

    // XMLSerializer emits well-formed XHTML (namespaced, void elements closed), which
    // the SVG data URL is parsed as. innerHTML would produce invalid XML here.
    const serialized = new XMLSerializer().serializeToString(wrapper);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
      + `<foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject>`
      + `</svg>`;
  };

  const loadImage = (source) => new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("render timeout")), RENDER_TIMEOUT_MS);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error("render failed")); };
    image.src = source;
  });

  const renderToPngBlob = async (element) => {
    // offsetWidth/Height ignore the preview's CSS scale transform, so this is the
    // natural A4 pixel size no matter how the preview is currently fitted.
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (!width || !height) return null;

    const markup = buildSvgMarkup(element, width, height);
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
    const scale = Math.min(MAX_SCALE, Math.max(1, window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      } catch {
        resolve(null); // Tainted canvas (some WebKit builds taint foreignObject).
      }
    });
  };

  const openWhatsApp = (text) => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) window.location.href = url;
  };

  /* Returns one of: "shared-file" | "shared-text" | "cancelled" | "whatsapp-link".
     Rasterising costs a few hundred ms, well inside the browser's transient user
     activation window, so navigator.share still counts as gesture-driven. */
  const shareBill = async ({ element, fileName, title, text, onStatus, onFallbackPrint }) => {
    const canShare = typeof navigator.share === "function";
    const canShareFiles = canShare && typeof navigator.canShare === "function";

    if (canShareFiles && element) {
      if (onStatus) onStatus("rendering");
      let file = null;
      try {
        const blob = await renderToPngBlob(element);
        if (blob) file = new File([blob], fileName, { type: "image/png" });
      } catch {
        file = null; // Fall through to text sharing.
      }
      if (file && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title, text });
          return "shared-file";
        } catch (error) {
          if (error && error.name === "AbortError") return "cancelled";
        }
      }
    }

    if (canShare) {
      try {
        await navigator.share({ title, text });
        return "shared-text";
      } catch (error) {
        if (error && error.name === "AbortError") return "cancelled";
      }
    }

    openWhatsApp(text);
    if (onFallbackPrint) onFallbackPrint();
    return "whatsapp-link";
  };

  window.STKShare = { shareBill, renderToPngBlob };
})();
