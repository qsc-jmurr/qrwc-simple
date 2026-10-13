/**
 * MOCK Q-SYS CORE — for rehearsing and for attendees without hardware.
 * QRWC doesn't connect to Designer's Emulation mode, so this fakes just enough
 * of the QRC WebSocket API for QRWC to talk to it. It is NOT a real Core:
 * behaviour (tapers, timing, errors) is simplified.
 *
 *   npm run mock-core            -> ws://localhost:8080/qrc-public-api/v0
 *   then connect the app to:  ws://localhost:8080
 */
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8080);

const fmtDb = (v) => `${v.toFixed(1)}dB`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- the "design" -----------------------------------------------------------
const design = {
  Gain: {
    Type: "gain",
    controls: {
      gain: { Type: "Float", Direction: "Read/Write", Value: -10, ValueMin: -100, ValueMax: 20, fmt: fmtDb },
      mute: { Type: "Boolean", Direction: "Read/Write", Value: 0, ValueMin: 0, ValueMax: 1, fmt: (v) => (v ? "muted" : "unmuted") },
    },
  },
  Room_Label: {
    Type: "custom_controls",
    controls: { "text.1": { Type: "Text", Direction: "Read/Write", Value: 0, String: "Boardroom" } },
  },
  Source_Select: {
    Type: "custom_controls",
    controls: {
      source: { Type: "Text", Direction: "Read/Write", Value: 0, String: "Laptop", Choices: ["Laptop", "Room PC", "Wireless", "Media Player"] },
      take: { Type: "Trigger", Direction: "Read/Write", Value: 0, ValueMin: 0, ValueMax: 1, fmt: () => "" },
    },
  },
  Program_Meter: {
    Type: "meter2",
    controls: { "meter.1": { Type: "Float", Direction: "Read Only", Value: -40, ValueMin: -60, ValueMax: 0, fmt: fmtDb } },
  },
};

function stateOf(component, name) {
  const c = design[component].controls[name];
  const isNum = c.Type !== "Text";
  const pos = isNum && c.ValueMax !== c.ValueMin ? (c.Value - c.ValueMin) / (c.ValueMax - c.ValueMin) : 0;
  return {
    Component: component,
    Name: name,
    Type: c.Type,
    Direction: c.Direction,
    Value: c.Value,
    ValueMin: c.ValueMin,
    ValueMax: c.ValueMax,
    Position: pos,
    String: isNum ? c.fmt(c.Value) : c.String,
    ...(c.Choices ? { Choices: c.Choices } : {}),
  };
}

// ---- change tracking --------------------------------------------------------
const groups = new Map(); // groupId -> { controls:Set<key>, dirty:Set<key>, ws }
const key = (c, n) => `${c}\u0000${n}`;
function markDirty(component, name) {
  for (const g of groups.values()) if (g.controls.has(key(component, name))) g.dirty.add(key(component, name));
}

function setControl(component, upd) {
  const c = design[component]?.controls[upd.Name];
  if (!c) throw new Error(`Unknown control ${component}.${upd.Name}`);
  if (c.Direction === "Read Only") throw new Error("Read only");
  if (c.Type === "Text") {
    if (upd.String !== undefined) c.String = String(upd.String);
    else if (typeof upd.Value === "string") c.String = upd.Value;
  } else if (upd.Position !== undefined) {
    c.Value = c.ValueMin + clamp(upd.Position, 0, 1) * (c.ValueMax - c.ValueMin);
  } else if (upd.Value !== undefined) {
    c.Value = clamp(Number(upd.Value), c.ValueMin, c.ValueMax);
  }
  if (c.Type === "Boolean") c.Value = c.Value >= 0.5 ? 1 : 0;
  if (c.Type === "Trigger") setTimeout(() => ((c.Value = 0), markDirty(component, upd.Name)), 150);
  markDirty(component, upd.Name);
  return stateOf(component, upd.Name);
}

// Animate the meter so the explorer has something alive in it.
setInterval(() => {
  const g = design.Gain.controls;
  const m = design.Program_Meter.controls["meter.1"];
  const target = g.mute.Value ? -60 : clamp(-30 + g.gain.Value * 0.5 + (Math.random() * 12 - 6), -60, 0);
  m.Value = m.Value + (target - m.Value) * 0.4;
  markDirty("Program_Meter", "meter.1");
}, 100);

// ---- QRC JSON-RPC -----------------------------------------------------------
const handlers = {
  NoOp: () => true,
  StatusGet: () => engineStatus(),
  "Component.GetComponents": () =>
    Object.entries(design).map(([Name, c]) => ({ ID: Name, Name, Type: c.Type, Properties: [], Controls: null, ControlSource: 2 })),
  "Component.GetControls": ({ Name }) => ({
    Name,
    Controls: Object.keys(design[Name].controls).map((n) => stateOf(Name, n)),
  }),
  "ChangeGroup.AddComponentControl": ({ Id, Component }, ws) => {
    const g = groups.get(Id) ?? { controls: new Set(), dirty: new Set(), ws };
    groups.set(Id, g);
    for (const { Name } of Component.Controls) {
      g.controls.add(key(Component.Name, Name));
      g.dirty.add(key(Component.Name, Name)); // first poll reports current value
    }
    return { Id, Controls: Component.Controls.map((c) => c.Name) };
  },
  "ChangeGroup.Poll": ({ Id }) => {
    const g = groups.get(Id);
    if (!g) return { Id, Changes: [] };
    const Changes = [...g.dirty].map((k) => stateOf(...k.split("\u0000")));
    g.dirty.clear();
    return { Id, Changes };
  },
  "Component.Set": ({ Name, Controls }) => Controls.map((c) => setControl(Name, c)),
};

const engineStatus = () => ({
  Platform: "Mock Core (not real hardware)",
  State: "Active",
  DesignName: "QRWC_Workshop_Mock",
  DesignCode: "mock",
  IsRedundant: false,
  IsEmulator: false,
  Status: { Code: 0, String: "OK" },
});

const wss = new WebSocketServer({ port: PORT, path: "/qrc-public-api/v0" });
wss.on("connection", (ws, req) => {
  console.log(`client connected from ${req.socket.remoteAddress}`);
  ws.send(JSON.stringify({ jsonrpc: "2.0", method: "EngineStatus", params: engineStatus() }));
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const h = handlers[msg.method];
    if (!h) return ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } }));
    try {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: h(msg.params ?? {}, ws) }));
    } catch (e) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: 1, message: e.message } }));
    }
  });
  ws.on("close", () => {
    for (const [id, g] of groups) if (g.ws === ws) groups.delete(id);
    console.log("client disconnected");
  });
});

console.log(`Mock Q-SYS Core listening on ws://localhost:${PORT}/qrc-public-api/v0`);
console.log(`Connect QRWC with host: "ws://localhost:${PORT}"`);
