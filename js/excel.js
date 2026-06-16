// DATA 마스터 엑셀(.xlsx) 템플릿 / 내보내기 / 가져오기 — SheetJS CDN 동적 로드.
// 2,000명 이상 대량 등록용: 템플릿 받아서 채운 뒤 가져오기 → batchUpsertMaster 1~5회 round-trip.

let _xlsxPromise = null;

export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.async = true;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => {
      _xlsxPromise = null;
      reject(new Error("엑셀 라이브러리 로드 실패 (네트워크 확인)"));
    };
    document.head.appendChild(s);
  });
  return _xlsxPromise;
}

// 카테고리별 시트 컬럼 정의 — tab-data.js 의 그리드 컬럼과 동일한 키/허용값
const HI_OPTS = ["메뉴얼팩", "오토백", "집품", "워터"];
const PK_OPTS = ["메뉴얼", "오토백"]; // 팩가능자 (단순 가능자 — M/A 블록만, 이름 색 X)
const SP_PERM = ["오더피커", "AGV", "워터", "메뉴얼 멀티", "오토백 멀티"];
const SP_TEMP = ["AGV", "워터", "메뉴얼 멀티", "오토백 멀티"];

const ROLE_SHEETS = {
  manager: {
    label: "MANAGER",
    cols: [
      { key: "kucode",   label: "쿠코드", required: true, width: 14 },
      { key: "name",     label: "성함",   required: true, width: 14 },
      { key: "nickname", label: "닉네임", required: true, width: 14 },
      { key: "note",     label: "비고",   width: 24 },
    ],
  },
  captain: {
    label: "TEAM CAPTAIN",
    cols: [
      { key: "kucode",   label: "쿠코드", required: true, width: 14 },
      { key: "name",     label: "성함",   required: true, width: 14 },
      { key: "nickname", label: "닉네임", required: true, width: 14 },
      { key: "note",     label: "비고",   width: 24 },
    ],
  },
  ps: {
    label: "PS",
    cols: [
      { key: "kucode", label: "쿠코드", required: true, width: 14 },
      { key: "name",   label: "성함",   required: true, width: 14 },
      { key: "team",   label: "조",     width: 10 },
      { key: "note",   label: "비고",   width: 24 },
    ],
  },
  perm: {
    label: "PERM",
    cols: [
      { key: "kucode",   label: "쿠코드",   required: true, width: 14 },
      { key: "name",     label: "성함",     required: true, width: 14 },
      { key: "team",     label: "조",       width: 10 },
      { key: "packable", label: "팩가능자", multi: PK_OPTS, width: 14 },
      { key: "hiSkill",  label: "하이스킬", multi: HI_OPTS, width: 24 },
      { key: "special",  label: "특수",     multi: SP_PERM, width: 18 },
      { key: "note",     label: "비고",     width: 24 },
    ],
  },
  temp: {
    label: "TEMP",
    cols: [
      { key: "kucode",   label: "쿠코드",   required: true, width: 14 },
      { key: "name",     label: "성함",     required: true, width: 14 },
      { key: "packable", label: "팩가능자", multi: PK_OPTS, width: 14 },
      { key: "hiSkill",  label: "하이스킬", multi: HI_OPTS, width: 24 },
      { key: "special",  label: "특수",     multi: SP_TEMP, width: 18 },
      { key: "note",     label: "비고",     width: 24 },
    ],
  },
  cd: {
    label: "CD",
    cols: [
      { key: "kucode",  label: "쿠코드", required: true, width: 14 },
      { key: "name",    label: "성함",   required: true, width: 14 },
      { key: "process", label: "공정",   width: 12 },
      { key: "note",    label: "비고",   width: 24 },
    ],
  },
};

function headerLabel(col) {
  return col.required ? `${col.label}*` : col.label;
}

function guideSheetRows(role) {
  const def = ROLE_SHEETS[role];
  const multiCols = def.cols.filter((c) => c.multi);
  const rows = [
    [`GWJ2 OB PDA 일지 — ${def.label} 등록 템플릿`],
    [],
    ["작성 방법"],
    ["1. 'DATA' 시트에 한 줄에 한 명씩 입력하세요. (* 표시는 필수)"],
    ["2. 쿠코드는 필수입니다. 쿠코드가 빈 행은 건너뜁니다."],
    ["3. 파일 안에 같은 쿠코드가 여러 번 있으면 마지막 행 기준으로 적용됩니다."],
  ];
  if (multiCols.length) {
    rows.push(["4. 여러 값은 쉼표(,)로 구분해 입력하세요. 예) 메뉴얼팩,오토백"]);
    multiCols.forEach((c) => {
      rows.push([`   - ${c.label} 가능 값: ${c.multi.join(" / ")}`]);
    });
    rows.push(["   - 목록에 없는 값은 무시됩니다."]);
  }
  rows.push([]);
  rows.push(["업로드: DATA 탭 → 📗 엑셀 → 📥 엑셀 가져오기"]);
  rows.push(["기존 쿠코드는 새 정보로 갱신(병합)되고, 없는 쿠코드는 새로 추가됩니다."]);
  return rows;
}

function buildWorkbook(XLSX, role, rows) {
  const def = ROLE_SHEETS[role];
  const header = def.cols.map(headerLabel);
  const body = (rows || []).map((r) =>
    def.cols.map((c) => {
      const v = r[c.key];
      if (Array.isArray(v)) return v.join(",");
      return v == null ? "" : String(v);
    })
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = def.cols.map((c) => ({ wch: c.width || 14 }));

  const guide = XLSX.utils.aoa_to_sheet(guideSheetRows(role));
  guide["!cols"] = [{ wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DATA");
  XLSX.utils.book_append_sheet(wb, guide, "작성 안내");
  return wb;
}

function ymd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// ── 템플릿 다운로드 (빈 시트 + 작성 안내) ──
export async function downloadMasterTemplate(role) {
  const XLSX = await loadXLSX();
  const wb = buildWorkbook(XLSX, role, []);
  XLSX.writeFile(wb, `gw2ob-${role}-템플릿.xlsx`);
}

// ── 현재 데이터 내보내기 (수정 후 그대로 재업로드 가능한 형식) ──
export async function exportMasterXlsx(shift, role, rows) {
  const XLSX = await loadXLSX();
  const wb = buildWorkbook(XLSX, role, rows);
  XLSX.writeFile(wb, `gw2ob-${shift}-${role}-${ymd()}.xlsx`);
}

// ── 가져오기: .xlsx / .xls / .csv 파싱 + 정규화 ──
// 반환: { rows, dupCount, skippedNoKucode, invalidTokens }
export async function parseMasterFile(file, role) {
  const XLSX = await loadXLSX();
  const def = ROLE_SHEETS[role];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // 데이터 시트 선택 — "DATA" 우선, 없으면 안내 시트가 아닌 첫 시트
  const sheetName =
    wb.SheetNames.find((n) => n.trim().toUpperCase() === "DATA") ||
    wb.SheetNames.find((n) => !n.includes("안내")) ||
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("시트를 찾을 수 없습니다.");

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  if (!aoa.length) throw new Error("빈 파일입니다.");

  // 헤더 행 찾기 — 라벨(또는 키)이 포함된 첫 행
  const norm = (s) => String(s ?? "").replace(/\*/g, "").trim().toLowerCase();
  const labelToKey = new Map();
  def.cols.forEach((c) => {
    labelToKey.set(norm(c.label), c.key);
    labelToKey.set(norm(c.key), c.key);
  });

  let headerIdx = -1;
  let colKeys = [];
  for (let i = 0; i < Math.min(aoa.length, 5); i++) {
    const keys = (aoa[i] || []).map((cell) => labelToKey.get(norm(cell)) || null);
    if (keys.includes("kucode")) { headerIdx = i; colKeys = keys; break; }
  }
  if (headerIdx < 0) {
    throw new Error("헤더 행을 찾을 수 없습니다. 템플릿의 '쿠코드/성함...' 헤더를 유지해주세요.");
  }

  const colDefByKey = new Map(def.cols.map((c) => [c.key, c]));
  const byKu = new Map();
  let dupCount = 0;
  let skippedNoKucode = 0;
  let invalidTokens = 0;

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const cells = aoa[i] || [];
    if (cells.every((c) => String(c ?? "").trim() === "")) continue; // 완전 빈 행
    const row = {};
    colKeys.forEach((key, ci) => {
      if (!key) return;
      const c = colDefByKey.get(key);
      const raw = String(cells[ci] ?? "").trim();
      if (c?.multi) {
        const tokens = raw ? raw.split(/[,/·;|]/).map((t) => t.trim()).filter(Boolean) : [];
        const valid = tokens.filter((t) => c.multi.includes(t));
        invalidTokens += tokens.length - valid.length;
        row[key] = valid;
      } else {
        row[key] = raw;
      }
    });
    const ku = String(row.kucode || "").trim();
    if (!ku) { skippedNoKucode++; continue; }
    row.kucode = ku;
    if (byKu.has(ku)) dupCount++;
    byKu.set(ku, row); // 같은 쿠코드는 마지막 행이 이김
  }

  return {
    rows: [...byKu.values()],
    dupCount,
    skippedNoKucode,
    invalidTokens,
  };
}
