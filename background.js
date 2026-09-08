let engine = null,
  readyPromise = null,
  readyResolve = null,
  readyReject = null,
  job = null;

function stopEngine(reason = "Analysis stopped") {
  if (job) {
    job.reject(Error(reason));
    job = null;
  }
  engine?.terminate();
  engine = null;
  readyPromise = null;
  readyResolve = null;
  readyReject = null;
}
function onEngineLine(event) {
  const line = String(event.data?.data ?? event.data);
  if (line === "uciok" && readyResolve) {
    engine.postMessage("setoption name MultiPV value 2");
    engine.postMessage("setoption name Hash value 16");
    readyResolve(true);
    readyResolve = null;
    readyReject = null;
    return;
  }
  if (!job) return;
  const info = line.match(
    /info .*?depth (\d+).*?multipv (\d+).*?score (cp|mate) (-?\d+).*? pv (.+)$/,
  );
  if (info)
    job.lines[+info[2]] = {
      depth: +info[1],
      score: info[3] === "mate" ? (+info[4] > 0 ? 100000 : -100000) : +info[4],
      pv: info[5].split(" "),
    };
  if (line.startsWith("bestmove")) {
    const first = job.lines[1] || { depth: 0, score: 0, pv: [] },
      done = job;
    job = null;
    done.resolve({
      score: first.score,
      depth: first.depth,
      lines: Object.keys(done.lines)
        .sort((a, b) => a - b)
        .map((k) => done.lines[k]),
    });
  }
}
function ensureEngine() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
    const js = browser.runtime.getURL("engine/stockfish/stockfish.js");
    // Stockfish.js derives stockfish.wasm from its own same-basename URL.
    // This is the upstream browser entry pattern; URL-fragment bootstrapping
    // prevents initialization in Firefox extension workers.
    try {
      engine = new Worker(js);
    } catch (e) {
      readyPromise = null;
      return reject(Error("Firefox blocked the packaged Stockfish worker"));
    }
    const timer = setTimeout(() => {
        if (readyReject) {
          const fail = readyReject;
          stopEngine();
          fail(Error("Stockfish startup timed out"));
        }
      }, 15000),
      originalResolve = readyResolve;
    readyResolve = (value) => {
      clearTimeout(timer);
      originalResolve(value);
    };
    engine.onmessage = onEngineLine;
    engine.onerror = () => {
      const fail = readyReject;
      stopEngine("Stockfish stopped unexpectedly");
      if (fail) fail(Error("Stockfish failed to load"));
    };
    engine.postMessage("uci");
  });
  return readyPromise;
}
async function analyze(fen, id, depth) {
  await ensureEngine();
  if (job) throw Error("Stockfish is already analyzing");
  return new Promise((resolve, reject) => {
    job = { id, resolve, reject, lines: {} };
    engine.postMessage("position fen " + fen);
    engine.postMessage(`go depth ${depth}`);
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "LCR_ENGINE_INIT")
    return ensureEngine()
      .then(() => ({ ok: true }))
      .catch((e) => ({ ok: false, error: e.message }));
  if (message?.type === "LCR_ENGINE_ANALYZE")
    return analyze(message.fen, message.id, message.depth)
      .then((result) => ({ ok: true, ...result }))
      .catch((e) => ({ ok: false, error: e.message }));
  if (message?.type === "LCR_ENGINE_STOP") {
    stopEngine();
    return Promise.resolve({ ok: true });
  }
});
