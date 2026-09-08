/* Minimal, dependency-free PGN/SAN position reader. Not an engine. */
(() => {
  const FILES = "abcdefgh";
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  function fromFen(fen = start) {
    const [layout, turn, castle, ep, half, full] = fen.split(/\s+/);
    const board = [];
    for (const row of layout.split("/")) {
      const out = [];
      for (const c of row) {
        if (/\d/.test(c)) out.push(...Array(+c).fill(null));
        else out.push(c);
      }
      board.push(out);
    }
    return { board, turn, castle, ep, half: +half || 0, full: +full || 1 };
  }
  function fen(s) {
    return (
      s.board
        .map((r) => {
          let z = 0,
            o = "";
          for (const p of r) {
            if (!p) z++;
            else {
              if (z) ((o += z), (z = 0));
              o += p;
            }
          }
          return o + (z || "");
        })
        .join("/") +
      ` ${s.turn} ${s.castle || "-"} ${s.ep || "-"} ${s.half} ${s.full}`
    );
  }
  function sq(v) {
    return [8 - +v[1], FILES.indexOf(v[0])];
  }
  function name(r, c) {
    return FILES[c] + (8 - r);
  }
  function white(p) {
    return p && p === p.toUpperCase();
  }
  function candidates(s, piece, to, capture, fromFile, fromRank) {
    const [tr, tc] = sq(to),
      out = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = s.board[r][c];
        if (!p || p.toUpperCase() !== piece || white(p) !== (s.turn === "w"))
          continue;
        if (
          (fromFile && FILES[c] !== fromFile) ||
          (fromRank && String(8 - r) !== fromRank)
        )
          continue;
        const dr = tr - r,
          dc = tc - c,
          ad = Math.abs(dr),
          ac = Math.abs(dc);
        let ok = false,
          slide = false;
        if (piece === "P") {
          const d = s.turn === "w" ? -1 : 1;
          ok = capture
            ? dr === d && ac === 1
            : dc === 0 &&
              (dr === d ||
                (dr === 2 * d &&
                  r === (s.turn === "w" ? 6 : 1) &&
                  !s.board[r + d][c]));
        } else if (piece === "N") ok = ad * ac === 2;
        else if (piece === "B") ((ok = ad === ac), (slide = ok));
        else if (piece === "R") ((ok = (dr === 0) != (dc === 0)), (slide = ok));
        else if (piece === "Q")
          ((ok = ad === ac || dr === 0 || dc === 0), (slide = ok));
        else if (piece === "K") ok = Math.max(ad, ac) === 1;
        if (ok && slide) {
          const sr = Math.sign(dr),
            sc = Math.sign(dc);
          for (
            let rr = r + sr, cc = c + sc;
            rr !== tr || cc !== tc;
            rr += sr, cc += sc
          )
            if (s.board[rr][cc]) ok = false;
        }
        if (ok && (!s.board[tr][tc] || white(s.board[tr][tc]) !== white(p)))
          out.push([r, c]);
      }
    return out;
  }
  function play(s, san) {
    san = san.replace(/[+#?!]+/g, "");
    const before = fen(s);
    if (/^O-O(-O)?$/.test(san)) {
      const long = san.includes("O-O-O"),
        r = s.turn === "w" ? 7 : 0,
        kc = 4,
        tc = long ? 2 : 6,
        rc = long ? 0 : 7,
        rtc = long ? 3 : 5;
      s.board[r][tc] = s.board[r][kc];
      s.board[r][kc] = null;
      s.board[r][rtc] = s.board[r][rc];
      s.board[r][rc] = null;
      const uci = name(r, kc) + name(r, tc);
      finish(s, s.board[r][tc], r, kc, r, tc);
      return { san, uci, before, after: fen(s) };
    }
    const m = san.match(
      /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?$/,
    );
    if (!m) throw Error("Unsupported SAN: " + san);
    let piece = m[1] || "P",
      to = m[5],
      list = candidates(s, piece, to, !!m[4], m[2], m[3]);
    // Some Chess.com themes draw piece letters as CSS icons, leaving "Bg2" as
    // textContent "g2". Recover the omitted letter only for a unique source.
    if (!m[1] && !list.length) {
      const inferred = [];
      for (const kind of "NBRQK")
        for (const from of candidates(s, kind, to, !!m[4], m[2], m[3]))
          inferred.push({ kind, from });
      if (inferred.length === 1) {
        piece = inferred[0].kind;
        list = [inferred[0].from];
        san = piece + san;
      }
    }
    if (!list.length) throw Error("No source for " + san);
    const [tr, tc] = sq(to),
      [r, c] = list[0],
      p = s.board[r][c],
      uci = name(r, c) + to + (m[6]?.toLowerCase() || "");
    if (piece === "P" && m[4] && !s.board[tr][tc])
      s.board[tr + (s.turn === "w" ? 1 : -1)][tc] = null;
    s.board[tr][tc] = m[6] ? (s.turn === "w" ? m[6] : m[6].toLowerCase()) : p;
    s.board[r][c] = null;
    finish(s, p, r, c, tr, tc);
    return { san, uci, before, after: fen(s) };
  }
  function finish(s, p, r, c, tr, tc) {
    if (p.toUpperCase() === "K")
      s.castle = s.castle.replace(s.turn === "w" ? /[KQ]/g : /[kq]/g, "");
    if (p.toUpperCase() === "R") {
      if (r === 7 && c === 0) s.castle = s.castle.replace("Q", "");
      if (r === 7 && c === 7) s.castle = s.castle.replace("K", "");
      if (r === 0 && c === 0) s.castle = s.castle.replace("q", "");
      if (r === 0 && c === 7) s.castle = s.castle.replace("k", "");
    }
    s.ep =
      p.toUpperCase() === "P" && Math.abs(tr - r) === 2
        ? name((r + tr) / 2, c)
        : "-";
    s.turn = s.turn === "w" ? "b" : "w";
    if (s.turn === "w") s.full++;
    s.half++;
  }
  function parse(pgn) {
    const tags = Object.fromEntries(
      [...pgn.matchAll(/\[([^\s]+)\s+"([^"]*)"\]/g)].map((x) => [x[1], x[2]]),
    );
    let body = pgn
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/;[^\n]*/g, " ");
    while (/\([^()]*\)/.test(body)) body = body.replace(/\([^()]*\)/g, " ");
    const toks = body
      .split(/\s+/)
      .map((x) => x.replace(/^\d+\.(\.\.)?/, ""))
      .filter(
        (x) => x && !/^\d+\.*$/.test(x) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(x),
      );
    const s = fromFen(tags.FEN || start),
      moves = [];
    for (const t of toks) moves.push(play(s, t));
    return { tags, moves, startFen: tags.FEN || start };
  }
  window.LCRChess = { parse, fromFen, fen };
})();
