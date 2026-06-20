// 업무일(비즈니스 데이트) 헬퍼.
// 스윙조는 19:00~04:00 근무라 자정을 넘기면 달력상 날짜가 바뀌어 일지가 다음날로 넘어간다.
// 그래서 스윙조는 "정오(12시) 이전"이면 아직 전날 근무로 간주해 전일자를 기본값으로 돌려준다.
//   예) 19일 23:59 → 19일,  20일 02:00 → 19일(전일),  20일 15:00(오늘밤 출근 준비) → 20일
// 주간조는 항상 달력상 오늘.

const SWING_ROLLOVER_HOUR = 12; // 스윙조: 이 시각 이전이면 전일로 취급 (자정~정오)

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 근무조 기준 업무일 — 날짜 입력의 기본값으로 사용.
export function businessToday(shift) {
  const now = new Date();
  if (shift === "swing" && now.getHours() < SWING_ROLLOVER_HOUR) {
    now.setDate(now.getDate() - 1);
  }
  return todayStr(now);
}
