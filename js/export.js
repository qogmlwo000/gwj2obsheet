// CSV/TSV 내보내기 헬퍼 — 외부 라이브러리 의존성 없음.
// Excel 호환을 위해 UTF-8 BOM 을 prefix 로 추가해 한글 깨짐 방지.

import {
  listMaster, listFlow, listOps, listShare,
} from "./db.js";

const BOM = "﻿";

/**
 * CSV 한 줄 escape: 쉼표/줄바꿈/큰따옴표 포함 시 큰따옴표로 감싸고 내부 " 는 "" 로.
 */
function csvCell(v) {
  if (v == null) return "";
  let s = Array.isArray(v) ? v.join(",") : String(v);
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers, rows) {
  const lines = [];
  lines.push(headers.map(csvCell).join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  return BOM + lines.join("\r\n");
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ymd(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// ── DATA (마스터) ──
const MASTER_HEADERS = {
  manager: ["kucode", "name", "nickname", "note"],
  captain: ["kucode", "name", "nickname", "note"],
  ps:      ["kucode", "name", "team", "note"],
  perm:    ["kucode", "name", "team", "packable", "hiSkill", "special", "note"],
  temp:    ["kucode", "name", "packable", "hiSkill", "special", "note"],
};
const MASTER_LABELS = {
  kucode: "쿠코드", name: "성함", nickname: "닉네임", team: "조",
  packable: "팩가능자", hiSkill: "하이스킬", special: "특수", note: "비고",
};

export async function exportMasterCsv(shift, role) {
  const rows = await listMaster(shift, role);
  const headers = MASTER_HEADERS[role] || Object.keys(rows[0] || { kucode: "" });
  const labeled = headers.map((h) => MASTER_LABELS[h] || h);
  // 헤더 라벨로 CSV 만들기 위해 row keys 를 labeled 로 매핑
  const lines = [BOM + labeled.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  downloadCsv(`gw2ob-${shift}-data-${role}-${ymd()}.csv`, lines.join("\r\n"));
}

// ── FLOW (일자별) ──
const FLOW_HEADERS = {
  captain: ["kucode", "name", "nickname", "position", "date"],
  ps:      ["kucode", "name", "team", "position", "date"],
  leave:   ["kucode", "name", "team", "leaveTime", "date"],
  newTemp: ["kucode", "name", "gender", "date"],
};
const FLOW_LABELS = {
  kucode: "쿠코드", name: "성함", nickname: "닉네임", team: "조",
  position: "포지션", leaveTime: "조퇴시간", gender: "성별", date: "날짜",
};

export async function exportFlowCsv(shift, type, dateFrom, dateTo) {
  // 날짜 범위 — 각 날짜마다 listFlow 호출
  const dates = dateRange(dateFrom, dateTo);
  const all = [];
  for (const d of dates) {
    const rows = await listFlow(shift, type, d);
    rows.forEach((r) => all.push({ ...r, date: r.date || d }));
  }
  const headers = FLOW_HEADERS[type] || ["kucode", "name", "date"];
  const labeled = headers.map((h) => FLOW_LABELS[h] || h);
  const lines = [BOM + labeled.map(csvCell).join(",")];
  for (const row of all) {
    lines.push(headers.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  downloadCsv(`gw2ob-${shift}-flow-${type}-${dateFrom}_${dateTo}.csv`, lines.join("\r\n"));
}

// ── PACK / PICK (일자별) ──
const OPS_HEADERS = ["kucode", "name", "team", "line", "floor", "subType", "note", "date"];
const OPS_LABELS = {
  kucode: "쿠코드", name: "성함", team: "조", line: "라인", floor: "층",
  subType: "구분", note: "비고", date: "날짜",
};

export async function exportOpsCsv(shift, kind, dateFrom, dateTo) {
  const dates = dateRange(dateFrom, dateTo);
  const all = [];
  for (const d of dates) {
    const rows = await listOps(shift, kind, d);
    rows.forEach((r) => all.push({ ...r, date: r.date || d }));
  }
  const labeled = OPS_HEADERS.map((h) => OPS_LABELS[h] || h);
  const lines = [BOM + labeled.map(csvCell).join(",")];
  for (const row of all) {
    lines.push(OPS_HEADERS.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  downloadCsv(`gw2ob-${shift}-${kind}-${dateFrom}_${dateTo}.csv`, lines.join("\r\n"));
}

// ── 공유 시트 (현재 보드) ──
const SHARE_HEADERS = ["kucode", "name", "team", "group", "note"];
const SHARE_LABELS = {
  kucode: "쿠코드", name: "성함", team: "조", group: "집결지", note: "비고",
};

export async function exportShareCsv(shift, kind) {
  const rows = await listShare(shift, kind);
  const labeled = SHARE_HEADERS.map((h) => SHARE_LABELS[h] || h);
  const lines = [BOM + labeled.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(SHARE_HEADERS.map((h) => csvCell(row[h] ?? "")).join(","));
  }
  downloadCsv(`gw2ob-${shift}-share-${kind}-${ymd()}.csv`, lines.join("\r\n"));
}

// ── 날짜 범위 유틸 ──
function dateRange(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [from];
  if (start > end) return [];
  const out = [];
  const d = new Date(start);
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
