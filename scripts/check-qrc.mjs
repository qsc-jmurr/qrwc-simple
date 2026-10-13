/**
 * QRC authentication check — no QRWC, no browser.
 *
 *   node scripts/check-qrc.mjs <core-ip> [access-token]
 *
 * Opens the QRC WebSocket on ws:// (port 80) and wss:// (port 443),
 * waits for EngineStatus, then asks for the component list and prints
 * whether the Core answered or asked for authentication.
 */
import WebSocket from "ws";

const [ip, token] = process.argv.slice(2);
if (!ip) {
  console.log("Usage: node scripts/check-qrc.mjs <core-ip> [access-token]");
  process.exit(1);
}

function probe(url, apiKey) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false }); // Cores use self-signed certs
    const done = (result) => {
      clearTimeout(timer);
      ws.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => done("timed out"), 8000);
    let engine = "";

    ws.on("error", (e) => done(`socket error: ${e.message}`));
    ws.on("close", (code, reason) => done(`closed by Core (${code}) ${reason}`));
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.method === "EngineStatus") {
        engine = `${msg.params.Platform}, "${msg.params.DesignName}"`;
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "probe",
            method: "Component.GetComponents",
            params: "test",
            ...(apiKey ? { apiKey } : {}),
          }),
        );
      } else if (msg.id === "probe") {
        if (msg.error) done(`${engine} → ERROR ${msg.error.code}: ${msg.error.message}`);
        else done(`${engine} → OK, ${msg.result.length} components`);
      }
    });
  });
}

const cases = [
  ["ws://  (port 80) ", `ws://${ip}/qrc-public-api/v0`, undefined],
  ["wss:// (port 443)", `wss://${ip}/qrc-public-api/v0`, undefined],
];
if (token) {
  cases.push(["ws://  + token   ", `ws://${ip}/qrc-public-api/v0`, token]);
  cases.push(["wss:// + token   ", `wss://${ip}/qrc-public-api/v0`, token]);
}

console.log(`Checking QRC on ${ip}\n`);
for (const [label, url, key] of cases) {
  console.log(`${label}  ${await probe(url, key)}`);
}
