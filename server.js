// 가장 단순한 정적 파일 서버 — Node.js 빌트인만 사용 (npm 의존성 없음).
// 시작.bat 으로 더블클릭 실행하면 자동으로 브라우저가 열립니다.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm":  "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".map":  "application/json; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  let url = req.url.split("?")[0];
  if (url === "/") url = "/index.html";
  let decoded;
  try { decoded = decodeURIComponent(url); } catch { decoded = url; }
  const filePath = path.join(ROOT, decoded);
  // 디렉토리 트래버설 방지
  const safeRoot = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (!filePath.startsWith(safeRoot) && filePath !== ROOT) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found: " + decoded);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("");
    console.error("  ⚠ 포트 " + PORT + "가 이미 사용 중입니다.");
    console.error("  이미 실행 중인 창이 있는지 확인하거나, 다른 포트를 쓰려면 환경변수 PORT 설정.");
    console.error("  http://localhost:" + PORT + " 에서 확인해보세요.");
    console.error("");
  } else {
    console.error("서버 시작 실패:", err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const url = "http://localhost:" + PORT;
  console.log("");
  console.log("  ✓ GWJ2 OB PDA 일지 실행 중");
  console.log("  ✓ 주소: " + url);
  console.log("  ✓ 잠시 후 브라우저가 자동으로 열립니다");
  console.log("");
  console.log("  종료하려면 Ctrl+C 또는 이 창을 닫으세요.");
  console.log("");
  // 브라우저 자동 오픈
  let cmd;
  if (process.platform === "win32") cmd = 'start "" "' + url + '"';
  else if (process.platform === "darwin") cmd = 'open "' + url + '"';
  else cmd = 'xdg-open "' + url + '"';
  exec(cmd, () => {});
});

// Ctrl+C 깔끔하게 종료
process.on("SIGINT", () => {
  console.log("\n  서버를 종료합니다...");
  server.close(() => process.exit(0));
});
