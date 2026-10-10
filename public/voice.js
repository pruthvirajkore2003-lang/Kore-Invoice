(() => {
  "use strict";

  // Groq key lives only in the Vercel Function (api/parse-voice.js). Offline file:// bundles call the deployed site.
  const ENDPOINT = location.protocol === "file:" ? "https://www.korewebs.site/api/parse-voice" : "/api/parse-voice";
  const MAX_RECORDING_MS = 60000;
  const OFFLINE_MESSAGE = "Voice fill requires internet. You can still fill the form manually.";

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
    if (navigator.onLine === false) throw new Error(OFFLINE_MESSAGE);
    const form = new FormData();
    form.append("audio", blob, `voice.${/mp4|m4a|aac/.test(blob.type) ? "mp4" : "webm"}`);
    form.append("docType", docType);
    form.append("currentDate", todayDmy());
    let response;
    try {
      response = await fetch(ENDPOINT, { method: "POST", body: form, signal: AbortSignal.timeout?.(45000) });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error("Voice fill failed. Please try again or fill manually.");
    return { transcript: String(body.transcript || ""), data: body.data && typeof body.data === "object" ? body.data : {} };
  };

  // Tap once to record, tap again (or wait 60 s) to stop and parse. Never touches form fields itself.
  const initVoiceButton = (button, { docType, toast, onResult }) => {
    if (!button) return;
    const label = button.querySelector(".voice-btn-label");
    const idleLabel = label?.textContent || "";
    let recorder = null;
    let stopTimer;

    const setState = (state) => {
      button.dataset.voiceState = state;
      button.setAttribute("aria-pressed", String(state === "recording"));
      button.setAttribute("aria-busy", String(state === "processing"));
      if (label) label.textContent = state === "recording" ? "Stop" : state === "processing" ? "Reading..." : idleLabel;
    };
    setState("inactive");

    const start = async () => {
      if (navigator.onLine === false) return toast(OFFLINE_MESSAGE);
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        return toast("Voice recording is not supported in this browser. Please fill manually.");
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return toast("Microphone permission denied. Please allow mic access or fill manually.");
      }
      const mimeType = pickMimeType();
      const chunks = [];
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        return toast("Voice recording is not supported in this browser. Please fill manually.");
      }
      recorder.addEventListener("dataavailable", (event) => event.data.size && chunks.push(event.data));
      recorder.addEventListener("stop", async () => {
        clearTimeout(stopTimer);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        recorder = null;
        if (!blob.size) {
          setState("inactive");
          return toast("No audio captured. Please try again.");
        }
        setState("processing");
        toast("Reading your voice note...");
        try {
          const result = await recordAndParse(blob, docType);
          if (!result.transcript) toast("Could not hear anything. Please try again.");
          else onResult(result);
        } catch (error) {
          toast(error.message);
        } finally {
          setState("inactive");
        }
      });
      recorder.start();
      setState("recording");
      toast("Listening... tap 🎤 again to stop");
      stopTimer = setTimeout(() => recorder?.state === "recording" && recorder.stop(), MAX_RECORDING_MS);
    };

    button.addEventListener("click", () => {
      const state = button.dataset.voiceState;
      if (state === "processing") return;
      if (state === "recording") recorder?.stop();
      else start().catch(() => { setState("inactive"); toast("Voice fill failed. Please fill manually."); });
    });
  };

  window.STKVoice = { initVoiceButton, recordAndParse };
})();
