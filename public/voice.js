(() => {
  "use strict";

  // Groq key lives only in the Vercel Function (api/parse-voice.js). Offline file:// bundles call the deployed site.
  const ENDPOINT = /^https?:$/.test(location.protocol) ? "/api/parse-voice" : "https://www.korewebs.site/api/parse-voice";
  const MAX_RECORDING_MS = 60000;
  // Looked up when shown, so messages follow a language switch made after this script loaded.
  const t = (key) => window.STKI18n.t(key);

  const pickMimeType = () => {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
    return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  };

  const todayDmy = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  };

  // Sends a recorded clip to the Edge Function; resolves { transcript, data } or throws with a user-facing message.
  const recordAndParse = async (blob, docType) => {
    if (navigator.onLine === false) throw new Error(t("voice.offline"));
    const form = new FormData();
    form.append("audio", blob, `voice.${/mp4|m4a|aac/.test(blob.type) ? "mp4" : "webm"}`);
    form.append("docType", docType);
    form.append("currentDate", todayDmy());
    let response;
    try {
      response = await fetch(ENDPOINT, { method: "POST", body: form, signal: AbortSignal.timeout?.(45000) });
    } catch {
      throw new Error(t("voice.offline"));
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error(t("voice.failed"));
    return { transcript: String(body.transcript || ""), data: body.data && typeof body.data === "object" ? body.data : {} };
  };

  // Tap once to record, tap again (or wait 60 s) to stop and parse. Never touches form fields itself.
  const initVoiceButton = (button, { docType, toast, onResult }) => {
    if (!button) return;
    const label = button.querySelector(".voice-btn-label");
    let recorder = null;
    let stopTimer;

    const setState = (state) => {
      button.dataset.voiceState = state;
      button.setAttribute("aria-pressed", String(state === "recording"));
      button.setAttribute("aria-busy", String(state === "processing"));
      if (label) label.textContent = t(state === "recording" ? "voice.stop" : state === "processing" ? "voice.reading" : "voice.idle");
    };
    setState("inactive");
    document.addEventListener("stk:langchange", () => setState(button.dataset.voiceState));

    const start = async () => {
      if (navigator.onLine === false) return toast(t("voice.offline"));
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        return toast(t("voice.unsupported"));
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return toast(t("voice.denied"));
      }
      const mimeType = pickMimeType();
      const chunks = [];
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        return toast(t("voice.unsupported"));
      }
      recorder.addEventListener("dataavailable", (event) => event.data.size && chunks.push(event.data));
      recorder.addEventListener("stop", async () => {
        clearTimeout(stopTimer);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        recorder = null;
        if (!blob.size) {
          setState("inactive");
          return toast(t("voice.noAudio"));
        }
        setState("processing");
        toast(t("voice.processing"));
        try {
          const result = await recordAndParse(blob, docType);
          if (!result.transcript) toast(t("voice.empty"));
          else onResult(result);
        } catch (error) {
          toast(error.message);
        } finally {
          setState("inactive");
        }
      });
      recorder.start();
      setState("recording");
      toast(t("voice.listening"));
      stopTimer = setTimeout(() => recorder?.state === "recording" && recorder.stop(), MAX_RECORDING_MS);
    };

    button.addEventListener("click", () => {
      const state = button.dataset.voiceState;
      if (state === "processing") return;
      if (state === "recording") recorder?.stop();
      else start().catch(() => { setState("inactive"); toast(t("voice.error")); });
    });
  };

  window.STKVoice = { initVoiceButton, recordAndParse };
})();
