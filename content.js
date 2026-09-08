(() => {
  if (window.__LCR_LOADED__) return;
  window.__LCR_LOADED__ = true;
  let panel = null,
    game = null,
    results = [],
    index = 0,
    analyzing = false,
    analysisDepth = 0;
  const VERSION = browser.runtime.getManifest().version;
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let stateCache = { at: 0, value: { live: false, completed: false } };
  function text() {
    return document.body?.innerText || "";
  }
  function state() {
    if (Date.now() - stateCache.at < 1500) return stateCache.value;
    const body = text();
    const liveSignals = /\b(resign|offer draw|draw offer)\b/i.test(body);
    const clockRunning = $$("[class*='clock']").some((x) =>
      x.className.toString().match(/clock-player-turn|clock-.*active/),
    );
    const resultElements = $$(
      ".game-result, .result-row, [data-test-element*='game-result'], [data-cy*='game-result'], [class*='game-over'], [data-test-element*='game-over']",
    );
    const resultElement = resultElements.some((x) =>
      /^(1-0|0-1|½-½|1\/2-1\/2)$|\b(game over|won by|drawn by|checkmate|resignation|timeout|aborted|stalemate|insufficient material|threefold repetition)\b/i.test(
        x.textContent.trim(),
      ),
    );
    const completed = resultElement || location.pathname.includes("/analysis/");
    // Chess.com sometimes leaves active-clock/control classes mounted after the result.
    // A definitive result must override those stale live markers.
    const value = {
      live: !completed && (liveSignals || clockRunning),
      completed,
    };
    stateCache = { at: Date.now(), value };
    return value;
  }
  function findPgn() {
    const sanPattern =
      /^(O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)$/;
    const asPgn = (moves) =>
      moves.map((m, i) => (i % 2 ? "" : `${i / 2 + 1}. `) + m).join(" ") + " *";
    const readSan = (node) => {
      let san = (node.textContent || "").trim().replace(/\s+/g, "");
      const unicode = san[0],
        unicodePiece = {
          "♔": "K",
          "♚": "K",
          "♕": "Q",
          "♛": "Q",
          "♖": "R",
          "♜": "R",
          "♗": "B",
          "♝": "B",
          "♘": "N",
          "♞": "N",
        }[unicode];
      if (unicodePiece) {
        san = unicodePiece + san.slice(1);
        return san;
      }
      if (/^[KQRBN]/.test(san) || /^O-O/.test(san)) return san;
      const meta = [node, ...node.querySelectorAll("*")]
        .slice(0, 9)
        .map(
          (x) =>
            `${x.className} ${x.getAttribute("aria-label") || ""} ${x.getAttribute("title") || ""} ${x.getAttribute("data-piece") || ""} ${x.getAttribute("data-figurine") || ""}`,
        )
        .join(" ")
        .toLowerCase();
      const named = meta.match(
          /(?:^|[^a-z])(king|queen|rook|bishop|knight)(?:[^a-z]|$)/,
        )?.[1],
        piece = { king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N" }[
          named
        ];
      return piece ? piece + san : san;
    };
    // Main-line nodes are authoritative. Auxiliary fields and analysis widgets
    // can contain coordinates such as "g2" that are not game moves.
    const main = [];
    for (let ply = 0; ply < 1000; ply++) {
      const node = $(`.main-line-ply[data-node="0-${ply}"]`);
      if (!node) break;
      const san = readSan(node);
      if (!sanPattern.test(san)) break;
      main.push(san);
    }
    if (main.length) return asPgn(main);
    const plainMain = $$(".main-line-ply")
      .map(readSan)
      .filter((x) => sanPattern.test(x));
    if (plainMain.length) return asPgn(plainMain);
    const sans = $$("[data-san]")
      .map((x) => x.dataset.san?.trim())
      .filter((x) => x && sanPattern.test(x));
    if (sans.length) return asPgn(sans);
    for (const el of $$("[data-pgn]")) {
      const v = el.dataset.pgn || "";
      if (/(?:^|\s)1\.\s*(?:O-O|[KQRBNa-h])/.test(v)) return v.trim();
    }
    const moveSources = [
      ".move-text-component",
      "[class*='node-san']",
      "[class*='move-san']",
    ];
    const moveEls =
      moveSources.map((s) => $$(s)).find((list) => list.length) || [];
    const moves = moveEls.map(readSan).filter((x) => sanPattern.test(x));
    if (moves.length) return asPgn(moves);
    const raw = text().match(
      /(?:^|\s)1\.\s+(?:O-O|[KQRBNa-h]).{20,}?(?:1-0|0-1|½-½|\*)/s,
    );
    return raw?.[0]?.replaceAll("½-½", "1/2-1/2") || null;
  }
  function ensureButton() {
    let b = $("#lcr-launch");
    if (!b) {
      b = document.createElement("button");
      b.id = "lcr-launch";
      document.body.append(b);
      b.onclick = start;
    }
    let v = $("#lcr-version");
    if (!v) {
      v = document.createElement("span");
      v.id = "lcr-version";
      document.body.append(v);
    }
    v.textContent = `Chess.com Local Eval (StockFish) v${VERSION}`;
    const s = state();
    b.disabled = analyzing || s.live || !s.completed;
    b.textContent = analyzing
      ? "Analyzing locally…"
      : s.live
        ? "Analysis locked during live game"
        : s.completed
          ? "Review locally"
          : "Open a completed game";
    b.title = s.live
      ? "For fair play, local analysis is unavailable until the game ends."
      : "Analyze this completed game on your device";
  }
  function toast(msg) {
    const n = document.createElement("div");
    n.className = "lcr-toast";
    n.textContent = msg;
    document.body.append(n);
    setTimeout(() => n.remove(), 3500);
  }
  async function start() {
    if (analyzing) return;
    const s = state();
    if (s.live || !s.completed)
      return toast("Analysis stays locked until the game is finished.");
    const pgn = findPgn();
    if (!pgn)
      return toast(
        "I couldn't find the moves on this page. Open the completed game's move list or analysis page.",
      );
    try {
      game = LCRChess.parse(pgn);
    } catch (e) {
      return toast(
        `Chess.com Local Eval (StockFish) v${VERSION} could not read the move list: ${e.message}`,
      );
    }
    if (!game.moves.length) return toast("No completed moves were found.");
    analyzing = true;
    ensureButton();
    openPanel();
    await analyze();
  }
  function openPanel() {
    panel?.remove();
    panel = document.createElement("aside");
    panel.className = "lcr-shell";
    panel.innerHTML = `<div class="lcr-head"><strong>Chess.com Local Eval (StockFish)</strong><span class="lcr-pill">POST-GAME ONLY</span><button class="lcr-close" title="Close">×</button></div><div class="lcr-note">Preparing local analysis…</div><div class="lcr-depthbar"><span>Stockfish <b data-depth>Depth —</b></span><label>Rerun at <select data-depth-choice><option>8</option><option>9</option><option>10</option><option>11</option><option>12</option><option>13</option><option>14</option><option>15</option><option>16</option><option>17</option><option>18</option></select></label><button data-rerun disabled>Rerun</button></div><div class="lcr-graph"></div><div class="lcr-summary"><div class="lcr-stat"><b data-n="blunder">0</b>Blunders</div><div class="lcr-stat"><b data-n="mistake">0</b>Mistakes</div><div class="lcr-stat"><b data-n="inaccuracy">0</b>Inaccuracies</div></div><div class="lcr-current"></div><div class="lcr-lines"></div><div class="lcr-moves"></div><div class="lcr-foot"><button data-go="prev">← Previous</button><button data-go="next">Next →</button></div>`;
    document.body.append(panel);
    $(".lcr-close", panel).onclick = () => {
      stopEngine();
      analyzing = false;
      panel.remove();
      panel = null;
      clearArrow();
      ensureButton();
    };
    $("[data-go=prev]", panel).onclick = () => show(Math.max(0, index - 1));
    $("[data-go=next]", panel).onclick = () =>
      show(Math.min(game.moves.length - 1, index + 1));
    $("[data-rerun]", panel).onclick = rerunChosenDepth;
    renderMoves();
  }
  function renderMoves() {
    const box = $(".lcr-moves", panel);
    box.replaceChildren();
    for (let i = 0; i < game.moves.length; i += 2) {
      const row = document.createElement("div");
      row.className = "lcr-row";
      const moveNumber = document.createElement("span");
      moveNumber.textContent = `${i / 2 + 1}.`;
      row.append(moveNumber);
      for (const j of [i, i + 1]) {
        if (!game.moves[j]) {
          row.append(document.createElement("span"));
          continue;
        }
        const button = document.createElement("button");
        button.className = "lcr-move";
        button.dataset.i = String(j);
        button.textContent = game.moves[j].san;
        button.onclick = () => show(j);
        row.append(button);
      }
      box.append(row);
    }
  }
  async function startEngine() {
    const r = await browser.runtime.sendMessage({ type: "LCR_ENGINE_INIT" });
    if (!r?.ok) throw Error(r?.error || "Stockfish could not start");
  }
  async function request(fen, id, depth) {
    const r = await browser.runtime.sendMessage({
      type: "LCR_ENGINE_ANALYZE",
      fen,
      id,
      depth,
    });
    if (!r?.ok) throw Error(r?.error || "Stockfish analysis failed");
    return r;
  }
  function stopEngine() {
    browser.runtime.sendMessage({ type: "LCR_ENGINE_STOP" }).catch(() => {});
  }
  function setDepthUi(depth, running) {
    if (!panel) return;
    const label = $("[data-depth]", panel),
      select = $("[data-depth-choice]", panel),
      button = $("[data-rerun]", panel);
    label.textContent = `Depth ${depth}${running ? " · running" : ""}`;
    select.value = String(depth);
    select.disabled = running;
    button.disabled = running;
    button.textContent = running ? "Analyzing…" : "Rerun";
  }
  async function rerunChosenDepth() {
    if (analyzing || !panel) return;
    const selected = Math.max(
      8,
      Math.min(
        18,
        Number($("[data-depth-choice]", panel).value) || analysisDepth,
      ),
    );
    analyzing = true;
    ensureButton();
    await analyze(selected);
  }
  async function analyze(requestedDepth = 0) {
    const depth =
      requestedDepth ||
      (game.moves.length > 80 ? 8 : game.moves.length > 40 ? 9 : 10);
    analysisDepth = depth;
    results = [];
    index = 0;
    clearArrow();
    renderMoves();
    for (const g of ["blunder", "mistake", "inaccuracy"])
      $(`[data-n=${g}]`, panel).textContent = "0";
    $(".lcr-graph", panel).replaceChildren();
    $(".lcr-current", panel).replaceChildren();
    $(".lcr-lines", panel).replaceChildren();
    setDepthUi(depth, true);
    $(".lcr-note", panel).textContent = "Loading local Stockfish…";
    try {
      await startEngine();
    } catch (e) {
      stopEngine();
      analyzing = false;
      ensureButton();
      if (panel) {
        $(".lcr-note", panel).textContent = e.message + ". Close and retry.";
        setDepthUi(depth, false);
      }
      return;
    }
    $(".lcr-note", panel).textContent = "Analyzing locally with Stockfish…";
    try {
      let prior = await request(game.startFen, "start", depth);
      let prevWhite = toWhite(prior.score, game.startFen);
      for (let i = 0; i < game.moves.length; i++) {
        if (!panel) return;
        const r = await request(game.moves[i].after, i, depth),
          best = prior.lines?.[0]?.pv?.[0] || null,
          second = prior.lines?.[1],
          gap = second
            ? Math.max(0, (prior.lines?.[0]?.score || 0) - second.score)
            : 0;
        const now = toWhite(r.score, game.moves[i].after),
          mover = i % 2 === 0 ? 1 : -1,
          loss = Math.max(0, Math.round((prevWhite - now) * mover)),
          moveGrade =
            loss <= 5 &&
            game.moves[i].uci === best &&
            gap >= 150 &&
            isAcceptedSacrifice(i)
              ? "brilliant"
              : grade(loss);
        results[i] = {
          ...r,
          white: now,
          beforeWhite: prevWhite,
          cpl: loss,
          grade: moveGrade,
          best,
          candidates: prior.lines || [],
        };
        prevWhite = now;
        prior = r;
        updateProgress(i + 1);
        await new Promise(requestAnimationFrame);
      }
    } catch (e) {
      stopEngine();
      analyzing = false;
      ensureButton();
      if (panel) {
        $(".lcr-note", panel).textContent = e.message + ". Close and retry.";
        setDepthUi(depth, false);
      }
      return;
    }
    $(".lcr-note", panel).textContent =
      `Analysis complete at depth ${depth} · all calculations stayed on this device`;
    finalize();
    show(0);
    stopEngine();
    analyzing = false;
    setDepthUi(depth, false);
    ensureButton();
  }
  function toWhite(score, fen) {
    return (fen.split(" ")[1] === "w" ? 1 : -1) * score;
  }
  function grade(c) {
    return c >= 200
      ? "blunder"
      : c >= 100
        ? "mistake"
        : c >= 50
          ? "inaccuracy"
          : "good";
  }
  function material(fen, color) {
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9 },
      board = fen.split(" ")[0];
    return [...board].reduce(
      (sum, p) =>
        sum +
        (values[p.toLowerCase()] && (color === "w") === (p === p.toUpperCase())
          ? values[p.toLowerCase()]
          : 0),
      0,
    );
  }
  function isAcceptedSacrifice(i) {
    const move = game.moves[i],
      reply = game.moves[i + 1];
    if (!reply) return false;
    const color = i % 2 ? "b" : "w",
      opponent = color === "w" ? "b" : "w",
      ownLoss = material(move.before, color) - material(reply.after, color),
      opponentLoss =
        material(move.before, opponent) - material(reply.after, opponent);
    return ownLoss >= 3 && ownLoss > opponentLoss;
  }
  function updateProgress(n) {
    $(".lcr-note", panel).textContent =
      `Analyzing move ${n} of ${game.moves.length}…`;
    drawGraph();
  }
  function finalize() {
    for (const g of ["blunder", "mistake", "inaccuracy"])
      $(`[data-n=${g}]`, panel).textContent = results.filter(
        (x) => x.grade === g,
      ).length;
    results.forEach((r, i) =>
      $(`.lcr-move[data-i="${i}"]`, panel)?.classList.add(r.grade),
    );
    drawGraph();
  }
  function drawGraph() {
    const vals = results
      .filter(Boolean)
      .map((x) => Math.max(-600, Math.min(600, x.white)));
    if (!vals.length) return;
    const w = 400,
      h = 110,
      x = (i) => (i / Math.max(1, vals.length - 1)) * w,
      y = (v) => h / 2 - (v / 1200) * h,
      pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" "),
      colors = {
        brilliant: "#35c5cf",
        blunder: "#e05b63",
        mistake: "#e99a4a",
        inaccuracy: "#d8be55",
        good: "#8fc85d",
      },
      NS = "http://www.w3.org/2000/svg";
    const graph = $(".lcr-graph", panel);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const baseline = document.createElementNS(NS, "path");
    baseline.setAttribute("d", `M0 ${h / 2}H${w}`);
    baseline.setAttribute("stroke", "#4a5058");
    svg.append(baseline);
    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", pts);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#8fc85d");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(line);
    vals.forEach((value, i) => {
      const dot = document.createElementNS(NS, "circle");
      dot.classList.add("lcr-graph-dot");
      dot.dataset.i = String(i);
      dot.setAttribute("cx", x(i));
      dot.setAttribute("cy", y(value));
      dot.setAttribute("r", results[i]?.grade === "good" ? "2.5" : "4");
      dot.setAttribute("fill", colors[results[i]?.grade] || colors.good);
      dot.addEventListener("click", () => show(i));
      svg.append(dot);
    });
    graph.replaceChildren(svg);
  }
  function formatUci(uci) {
    return uci && uci.length >= 4
      ? `${uci.slice(0, 2)}→${uci.slice(2, 4)}${uci[4] ? `=${uci[4].toUpperCase()}` : ""}`
      : uci || "—";
  }
  function clickPly(ply) {
    const node = $(`.main-line-ply[data-node="0-${Math.max(0, ply)}"]`);
    if (node)
      node.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
  }
  function syncBoardAfter(i) {
    clickPly(i);
  }
  function syncBoardBefore(i) {
    clickPly(i - 1);
  }
  function show(i) {
    if (!results[i]) return;
    index = i;
    $$(".lcr-move", panel).forEach((x) =>
      x.classList.toggle("active", +x.dataset.i === i),
    );
    const r = results[i],
      best = formatUci(r.best);
    const current = $(".lcr-current", panel),
      moveNumber = document.createElement("b"),
      gradeLabel = document.createElement("span"),
      bestLabel = document.createElement("span"),
      evaluation = document.createElement("div");
    moveNumber.textContent = String(i + 1);
    gradeLabel.className = `lcr-grade ${r.grade}`;
    gradeLabel.textContent = r.grade;
    bestLabel.className = "lcr-best";
    bestLabel.textContent = `Best: ${best}`;
    evaluation.textContent = `Evaluation ${(r.white / 100).toFixed(2)} · Depth ${analysisDepth}`;
    current.replaceChildren(
      "Move ",
      moveNumber,
      " · ",
      gradeLabel,
      bestLabel,
      evaluation,
    );
    const lines = (r.candidates || []).slice(0, 1),
      box = $(".lcr-lines", panel);
    box.replaceChildren();
    if (!lines.length) {
      const unavailable = document.createElement("span");
      unavailable.className = "lcr-muted";
      unavailable.textContent = "The best line requires Stockfish.";
      box.append(unavailable);
    } else {
      lines.forEach((candidate, candidateIndex) => {
        const button = document.createElement("button"),
          colorDot = document.createElement("i"),
          score = document.createElement("b"),
          variation = document.createElement("span");
        button.className = "lcr-line";
        button.dataset.candidate = String(candidateIndex);
        button.title =
          "Preview the best alternative from before the played move";
        score.textContent = (candidate.score / 100).toFixed(2);
        variation.textContent = candidate.pv
          .slice(0, 8)
          .map(formatUci)
          .join("  ");
        button.append(colorDot, score, variation);
        button.onclick = () => {
          syncBoardBefore(i);
          setTimeout(() => drawArrows([candidate.pv?.[0]], r.beforeWhite), 120);
        };
        box.append(button);
      });
    }
    syncBoardAfter(i);
    setTimeout(
      () =>
        drawArrows(
          lines.map((l) => l.pv?.[0]),
          r.white,
          { uci: game.moves[i].uci, grade: r.grade },
        ),
      120,
    );
    $(`.lcr-move[data-i="${i}"]`, panel)?.scrollIntoView({ block: "nearest" });
  }
  function clearArrow() {
    $$(".lcr-board-overlay,.lcr-arrow,.lcr-square-highlight").forEach((x) =>
      x.remove(),
    );
  }
  function drawArrows(ucis, evalCp = 0, quality = null) {
    clearArrow();
    const board = $("wc-chess-board, chess-board, .board");
    if (!board) return;
    const rect = board.getBoundingClientRect(),
      size = Math.min(rect.width, rect.height),
      cell = size / 8,
      bottomClock = $(".clock-bottom"),
      clockClass = bottomClock?.className?.toString() || "",
      flip =
        /clock-black/.test(clockClass) ||
        (!/clock-white/.test(clockClass) &&
          (board.classList.contains("flipped") ||
            board.hasAttribute("flipped") ||
            board.getAttribute("orientation") === "black")),
      colors = ["#70b843", "#3993d0"],
      NS = "http://www.w3.org/2000/svg",
      pos = (s) => {
        let f = s.charCodeAt(0) - 97,
          r = +s[1] - 1;
        if (flip) {
          f = 7 - f;
          r = 7 - r;
        }
        return { x: (f + 0.5) * cell, y: (7 - r + 0.5) * cell };
      };
    const moves = (ucis || []).filter((u) => u && u.length >= 4).slice(0, 2),
      svg = document.createElementNS(NS, "svg");
    svg.classList.add("lcr-board-overlay");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${size}px;height:${size}px`;
    const whiteShare = 0.5 + 0.48 * Math.tanh(evalCp / 400),
      whiteH = size * whiteShare,
      barX = -34,
      barW = 28,
      barBg = document.createElementNS(NS, "rect"),
      barWhite = document.createElementNS(NS, "rect"),
      barBorder = document.createElementNS(NS, "rect");
    barBg.setAttribute("x", barX);
    barBg.setAttribute("y", "0");
    barBg.setAttribute("width", barW);
    barBg.setAttribute("height", size);
    barBg.setAttribute("rx", "4");
    barBg.setAttribute("fill", "#202124");
    svg.append(barBg);
    barWhite.setAttribute("x", barX);
    barWhite.setAttribute("y", flip ? "0" : String(size - whiteH));
    barWhite.setAttribute("width", barW);
    barWhite.setAttribute("height", whiteH);
    barWhite.setAttribute("rx", "4");
    barWhite.setAttribute("fill", "#f2f2f2");
    svg.append(barWhite);
    barBorder.setAttribute("x", barX);
    barBorder.setAttribute("y", "0");
    barBorder.setAttribute("width", barW);
    barBorder.setAttribute("height", size);
    barBorder.setAttribute("rx", "4");
    barBorder.setAttribute("fill", "none");
    barBorder.setAttribute("stroke", "#5e6269");
    barBorder.setAttribute("stroke-width", "1.5");
    svg.append(barBorder);
    const divider = document.createElementNS(NS, "line");
    divider.setAttribute("x1", barX);
    divider.setAttribute("x2", barX + barW);
    divider.setAttribute("y1", size / 2);
    divider.setAttribute("y2", size / 2);
    divider.setAttribute("stroke", "#6d7177");
    divider.setAttribute("stroke-width", "1");
    svg.append(divider);
    const score = document.createElementNS(NS, "text"),
      scoreText =
        Math.abs(evalCp) >= 90000
          ? evalCp > 0
            ? "+∞"
            : "−∞"
          : `${evalCp >= 0 ? "+" : ""}${(evalCp / 100).toFixed(1)}`,
      scoreOnTop = evalCp >= 0 ? flip : !flip;
    score.setAttribute("x", barX + barW / 2);
    score.setAttribute("y", scoreOnTop ? "17" : String(size - 8));
    score.setAttribute("text-anchor", "middle");
    score.setAttribute("fill", evalCp >= 0 ? "#17191d" : "#fff");
    score.setAttribute("font-size", "11");
    score.setAttribute("font-weight", "800");
    score.setAttribute("font-family", "system-ui, sans-serif");
    score.textContent = scoreText;
    svg.append(score);
    const defs = document.createElementNS(NS, "defs");
    moves.forEach((_, n) => {
      const marker = document.createElementNS(NS, "marker");
      marker.setAttribute("id", `lcr-head-${n}`);
      marker.setAttribute("viewBox", "0 0 12 12");
      marker.setAttribute("refX", "10");
      marker.setAttribute("refY", "6");
      marker.setAttribute("markerWidth", n ? "8" : "10");
      marker.setAttribute("markerHeight", n ? "8" : "10");
      marker.setAttribute("orient", "auto-start-reverse");
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M 0 0 L 12 6 L 0 12 z");
      path.setAttribute("fill", colors[n]);
      marker.append(path);
      defs.append(marker);
    });
    svg.append(defs);
    let qualityGroup = null;
    if (quality?.uci?.length >= 4) {
      const b = pos(quality.uci.slice(2, 4)),
        qualityIcons = {
          brilliant: "!!",
          good: "✓",
          inaccuracy: "?!",
          mistake: "?",
          blunder: "??",
        },
        qualityColors = {
          brilliant: "#2faebb",
          good: "#689f45",
          inaccuracy: "#b59b2f",
          mistake: "#bd702b",
          blunder: "#ba4149",
        },
        icon = qualityIcons[quality.grade] || "✓",
        color = qualityColors[quality.grade] || qualityColors.good,
        cx = Math.min(size - 13, Math.max(13, b.x + cell * 0.28)),
        cy = Math.min(size - 13, Math.max(13, b.y - cell * 0.28)),
        badge = document.createElementNS(NS, "circle");
      qualityGroup = document.createElementNS(NS, "g");
      badge.setAttribute("cx", cx);
      badge.setAttribute("cy", cy);
      badge.setAttribute("r", "11");
      badge.setAttribute("fill", color);
      badge.setAttribute("stroke", "#fff");
      badge.setAttribute("stroke-width", "1.5");
      badge.setAttribute("filter", "drop-shadow(0 2px 2px #0008)");
      qualityGroup.append(badge);
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", cx);
      label.setAttribute("y", cy + 3.5);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "#fff");
      label.setAttribute("font-size", icon.length > 1 ? "9" : "12");
      label.setAttribute("font-weight", "900");
      label.setAttribute("font-family", "system-ui, sans-serif");
      label.textContent = icon;
      qualityGroup.append(label);
    }
    moves.forEach((uci, n) => {
      const color = colors[n],
        a = pos(uci.slice(0, 2)),
        b = pos(uci.slice(2, 4)),
        stroke = n ? 3.5 : 5;
      for (const p of [a, b]) {
        const square = document.createElementNS(NS, "rect");
        square.setAttribute("x", p.x - cell / 2 + 3);
        square.setAttribute("y", p.y - cell / 2 + 3);
        square.setAttribute("width", cell - 6);
        square.setAttribute("height", cell - 6);
        square.setAttribute("rx", "4");
        square.setAttribute("fill", color + (n ? "12" : "1b"));
        square.setAttribute("stroke", color);
        square.setAttribute("stroke-width", n ? "1.5" : "2");
        svg.append(square);
      }
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", stroke);
      line.setAttribute("stroke-opacity", n ? "0.68" : "0.86");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("marker-end", `url(#lcr-head-${n})`);
      svg.append(line);
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy) || 1,
        cx = b.x - (dx / len) * 14,
        cy = b.y - (dy / len) * 14,
        badge = document.createElementNS(NS, "circle");
      badge.setAttribute("cx", cx);
      badge.setAttribute("cy", cy);
      badge.setAttribute("r", "8");
      badge.setAttribute("fill", color);
      svg.append(badge);
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", cx);
      label.setAttribute("y", cy + 3);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "#fff");
      label.setAttribute("font-size", "8");
      label.setAttribute("font-weight", "700");
      label.textContent = String(n + 1);
      svg.append(label);
    });
    if (qualityGroup) svg.append(qualityGroup);
    document.body.append(svg);
  }
  ensureButton();
  let scanTimer = 0;
  new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      stateCache.at = 0;
      ensureButton();
    }, 1500);
  }).observe(document.body || document.documentElement, {
    subtree: true,
    childList: true,
  });
  setInterval(() => {
    stateCache.at = 0;
    ensureButton();
  }, 5000);
})();
