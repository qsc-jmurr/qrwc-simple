# Simple QRWC App

A one-page Next.js app that connects to a Q-SYS Core with **@q-sys/qrwc 1.0** and gives two-way control of a Gain component. This is the code-along example for the QRWC workshop.

Everything QRWC-related is in **`app/page.tsx`**.

## Setup

You need **Node 22.5 or newer** (QRWC 1.0's minimum). Check with `node -v`.

```bash
npm install
npm run dev        # open http://localhost:3000
```

Set your Core's IP at the top of `app/page.tsx`:

```ts
const CORE_IP = "ws://192.168.1.100";
```

### In Q-SYS Designer

1. Add a **Gain** component and name it `Gain`.
2. Set its **Code Access** to **External**.
3. Save to the Core and run it. (QRWC doesn't connect to Emulation mode.)

### No Core?

Run `npm run mock-core` (a fake Core for rehearsing only) and set `CORE_IP` to `"ws://localhost:8080"`.

## The four steps in `app/page.tsx`

| Step | What it shows |
|---|---|
| **1. Connect** | `Qrwc.createQrwc({ host })` opens the connection and fetches the design. It returns `undefined` if it can't connect. |
| **2. Core → page** | Read `control.state` first, then listen for `"update"`. Move the fader in a UCI and the page follows. |
| **3. Page → Core** | `control.update(value)`. Move the page's fader and the UCI follows. |
| **4. Survive a drop** | Pass `reconnect` and QRWC retries on its own. Listen for `"disconnected"` and `"reconnected"` to show the status; `"reconnection failed"` means it gave up. Pull the Core's network cable to try it. |

Each step is marked with a `── STEP n ──` comment.

Because QRWC owns the connection (`host:`, not your own `socket:`), the controls survive a reconnect: the listeners from step 2 keep working and nothing needs re-subscribing.
