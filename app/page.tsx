"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Qrwc } from "@q-sys/qrwc";

// Your Core's address. ws:// because browsers only allow wss:// with a signed certificate.
const CORE_IP = "ws://10.130.61.195";

// Only if Access Control is on (Core Manager → Access Tokens). Leave "" if it's off.
// Fine for a demo; don't commit a real token to a shared repo.
const API_KEY = "09f55593-85b1-42e5-8c24-2b7d6bb93bbd";

// The Q-SYS components this page uses: a Gain component named "Gain",
// with Code Access set to External in Designer.
type Design = {
  Gain: "gain" | "mute";
};

type QrwcInstance = Awaited<ReturnType<typeof Qrwc.createQrwc<Design>>>;

// QRWC's own logging. Flip to true once to show the room everything QRWC does
// under the hood (very chatty), then back to false for the rest of the session.
const SHOW_QRWC_LOGS = false;

// Quiet mode: QRWC's errors only, and each distinct one once, not every 100 ms.
let lastError = "";
const quietLogger = {
  error: (e: unknown) => {
    const message = String(e instanceof Error ? e.message : e).split("\n")[0];
    if (message !== lastError) console.warn(message);
    lastError = message;
  },
};

export default function Home() {
  const [qrwc, setQrwc] = useState<QrwcInstance>();
  const [status, setStatus] = useState("Connecting…");
  const [gain, setGain] = useState(0);
  const [gainLabel, setGainLabel] = useState("—");
  const [isMuted, setIsMuted] = useState(false);

  const online = status.startsWith("Connected");

  useEffect(() => {
    let cancelled = false;
    let instance: QrwcInstance;

    (async () => {
      // ── STEP 1: CONNECT ───────────────────────────────────────────────
      // Give QRWC the Core's address and it opens (and looks after) the connection.
      const q = await Qrwc.createQrwc<Design>({
        host: CORE_IP, // QRWC adds /qrc-public-api/v0 for you
        apiKey: API_KEY || undefined,
        pollingInterval: 100,
        // Only fetch the components this page uses. Without this, QRWC registers EVERY
        // control in the design for polling: on a big design that's thousands of requests
        // at startup, the Core falls behind, and you get a wall of ChangeGroup errors.
        componentFilter: (component) => component.Name === "Gain",
        logger: SHOW_QRWC_LOGS ? console : quietLogger,
        reconnect: { maxAttempts: 10, delay: 1000, backoffFactor: 2, maxDelay: 10_000 }, // see STEP 4
      });
      
      if (cancelled) return void q?.close(); // the page closed while we were connecting
      if (!q) return setStatus("Couldn't connect"); // createQrwc returns undefined, it doesn't throw

      instance = q;
      setQrwc(q);
      setStatus(`Connected to ${q.engineStatus.DesignName}`);

      // ── STEP 2: CORE → PAGE ───────────────────────────────────────────
      const { gain, mute } = q.components.Gain.controls;

      // a) Read the current values now: "update" only fires on a CHANGE.
      setGain(gain.state.Value ?? 0);
      setGainLabel(gain.state.String ?? "—");
      setIsMuted(mute.state.Bool);

      // b) Then follow every change, from anywhere: a UCI, Designer, another browser.
      gain.on("update", (state) => {
        console.log("gain:", state.String);
        setGain(state.Value ?? 0);
        setGainLabel(state.String ?? "—"); // formatted by the Core, e.g. "-12.0dB"
      });
      mute.on("update", (state) => {
        console.log("mute:", state.Bool);
        setIsMuted(state.Bool);
      });

      // ── STEP 4: SURVIVE A DROP ────────────────────────────────────────
      // Unplug the Core (or stop the design). QRWC retries on its own, using the
      // `reconnect` settings above: wait 1 s, then 2, 4, 8, 10, 10… up to 10 tries.
      // The controls above are the same objects afterwards, so the listeners keep working.
      q.on("disconnected", (reason) =>
        setStatus(reason === "reconnection failed" ? "Disconnected: refresh to retry" : "Reconnecting…"),
      );
      q.on("reconnected", () => setStatus(`Connected to ${q.engineStatus.DesignName}`));
    })();

    // Close the connection when the page goes away.
    return () => {
      cancelled = true;
      instance?.close();
    };
  }, []);

  // ── STEP 3: PAGE → CORE ─────────────────────────────────────────────
  const handleGainChange = (value: number) => qrwc?.components.Gain.controls.gain.update(value);
  const handleToggleMute = () => qrwc?.components.Gain.controls.mute.update(!isMuted);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 p-6">
      <Image src="/logo-horizon.png" alt="Q-SYS" width={160} height={40} className="h-8 w-auto" priority />

      <section className="w-full max-w-md space-y-8 rounded-panel border border-line bg-surface p-6 shadow-[0_8px_40px_-12px_rgb(0_0_0/0.6)]">
        <header className="space-y-1">
          <h1 className="text-2xl tracking-tight">Simple QRWC App</h1>
          <p className="font-mono text-xs text-ink-muted">Gain control of a Q-SYS system via QRWC</p>
        </header>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="gain" className="text-xs uppercase tracking-wide text-ink-muted">
              Gain
            </label>
            <span className="rounded-md bg-surface-2 px-2 py-1 font-mono text-sm tabular-nums">{gainLabel}</span>
          </div>
          <input
            id="gain"
            type="range"
            min={-100}
            max={20}
            step={0.5}
            value={gain}
            disabled={!online}
            onChange={(e) => handleGainChange(Number(e.target.value))}
            className="w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>

        <button
          onClick={handleToggleMute}
          disabled={!online}
          className={`w-full rounded-xl py-3 text-sm font-medium transition active:translate-y-px disabled:opacity-40 ${
            isMuted ? "bg-danger text-white" : "bg-ok text-black"
          }`}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>

        <footer className="flex items-center gap-2 border-t border-line pt-4 text-xs text-ink-muted">
          <span
            className={`h-2 w-2 rounded-full ${online ? "bg-ok" : status.endsWith("…") ? "bg-warn animate-pulse" : "bg-danger"}`}
          />
          {status}
          <span className="ml-auto font-mono">Made by Q-SYS UK</span>
        </footer>
      </section>
    </main>
  );
}
