/* Shared share pipeline for the invoice and memo apps.
   Offline by construction: no libraries, no CDN, no network calls. The bill is
   rasterised locally through an SVG <foreignObject> snapshot, wrapped in a one-page
   A4 PDF and handed to the OS share sheet (WhatsApp sits at the top of it on Android).
   Every step degrades: PDF share -> PDF download + WhatsApp Web -> text share -> WhatsApp link. */
(() => {
  "use strict";

  const RENDER_TIMEOUT_MS = 6000;
  const SCALE = 2;
  const JPEG_QUALITY = 0.95;
  const A4_POINTS = [595.28, 841.89];

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
    // <html lang> is outside the clone; without it the image loses Marathi glyph forms and :lang() rules.
    wrapper.setAttribute("lang", document.documentElement.lang);
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

  // Always 2x (~192 dpi on A4): the PDF gets printed, so screen DPR is irrelevant here.
  const renderToJpeg = async (element) => {
    // offsetWidth/Height ignore the preview's CSS scale transform, so this is the
    // natural A4 pixel size no matter how the preview is currently fitted.
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (!width || !height) return null;

    const markup = buildSvgMarkup(element, width, height);
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.round(height * SCALE);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff"; // JPEG has no alpha; transparent areas would turn black.
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => {
      try {
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
      } catch {
        resolve(null); // Tainted canvas (some WebKit builds taint foreignObject).
      }
    });
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  };

  // One byte per char; every string written below is ASCII apart from the binary marker.
  const latin1 = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0));

  /* Minimal PDF 1.4: one A4 page showing one JPEG. /DCTDecode lets the JPEG bytes go in
     untouched, so no compressor is needed. xref offsets are byte positions, hence the
     byte arrays rather than strings. */
  const jpegToPdf = ({ bytes, width, height }) => {
    const [pageWidth, pageHeight] = A4_POINTS;
    const fit = Math.min(pageWidth / width, pageHeight / height);
    const drawWidth = width * fit;
    const drawHeight = height * fit;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    const content = `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    const objects = [
      ["<< /Type /Catalog /Pages 2 0 R >>"],
      ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
      [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`],
      [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, "\nendstream"],
      [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    ];

    const parts = [];
    let size = 0;
    const write = (part) => {
      const chunk = typeof part === "string" ? latin1(part) : part;
      parts.push(chunk);
      size += chunk.length;
    };
    // The high-byte comment line tells transfer tools the file is binary.
    write("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
    const offsets = objects.map((pieces, index) => {
      const offset = size;
      write(`${index + 1} 0 obj\n`);
      pieces.forEach(write);
      write("\nendobj\n");
      return offset;
    });
    const xref = size;
    // Each xref entry must be exactly 20 bytes: 10-digit offset, 5-digit generation, type, space + LF.
    write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
      + offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
      + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: "application/pdf" });
  };

  const renderToPdfBlob = async (element) => {
    const jpeg = await renderToJpeg(element);
    return jpeg ? jpegToPdf(jpeg) : null;
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The download reads the URL after click() returns; revoking at once can cancel it.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const openWhatsApp = (text) => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    // Not the "noopener" feature: with it window.open always returns null, which made the
    // fallback below navigate this tab away even when the new tab had opened.
    const opened = window.open(url, "_blank");
    if (opened) opened.opener = null;
    else window.location.href = url; // Popup blocked.
  };

  /* Returns one of: "shared-file" | "downloaded-pdf" | "shared-text" | "cancelled" | "whatsapp-link".
     Rendering costs a few hundred ms, well inside the browser's transient user
     activation window, so navigator.share still counts as gesture-driven.
     WhatsApp links carry text only, so where the OS share sheet cannot take the PDF
     (desktop browsers) it is downloaded for the user to attach by hand. */
  const shareBill = async ({ element, fileName, title, text }) => {
    let blob = null;
    try {
      if (element) blob = await renderToPdfBlob(element);
    } catch {
      blob = null; // Fall through to text sharing.
    }

    if (blob) {
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title, text });
          return "shared-file";
        } catch (error) {
          if (error && error.name === "AbortError") return "cancelled";
          // NotAllowedError (gesture expired) and the like: hand over the file by download.
        }
      }
      downloadBlob(blob, fileName);
      openWhatsApp(text);
      return "downloaded-pdf";
    }

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        return "shared-text";
      } catch (error) {
        if (error && error.name === "AbortError") return "cancelled";
      }
    }

    openWhatsApp(text);
    return "whatsapp-link";
  };

  window.STKShare = { shareBill, renderToPdfBlob };
})();
