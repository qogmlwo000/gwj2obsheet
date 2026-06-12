# GWJ2 OB PDA 일지

쿠팡 GW2 OB팀 PDA 일지 — DAY조 / SWING조 운영 기록 · **여러 매니저·캡틴이 실시간으로 동시 사용**하는 협업 도구.

---

## 🚀 빠르게 실행 (Windows)

**`시작.bat`** 파일을 더블클릭하세요. 끝.

자동으로 일어나는 일:
1. Node.js 가 설치돼 있는지 확인
2. 로컬 서버를 띄움 (`http://localhost:8080`)
3. 기본 브라우저에 앱이 자동으로 열림

> Node.js 가 없으면 [nodejs.org](https://nodejs.org) 에서 LTS 버전을 설치하세요. 설치 한 번이면 충분합니다.

종료할 때는 검정 cmd 창을 닫거나 `Ctrl + C` 를 누르세요.

### 왜 더블클릭으로 안 되고 서버가 필요한가요?
브라우저는 보안 정책상 `file://` 로 직접 열린 HTML 에서는 ES 모듈 import 와 fetch API 를 차단합니다. Firebase 도 동작하지 않아요. 작은 로컬 서버를 띄우면 모든 기능이 정상 작동합니다.

---

## ☁ Firebase 보안 규칙 (실사용 전 필수)

이 앱은 Firebase **Firestore** + **Realtime Database** 두 가지를 모두 사용합니다.
- Firestore: 인원 마스터, PACK/PICK/FLOW 일자 기록, 공유 시트, TC 포지션, 수정 이력 (audit)
- Realtime Database: 현재 접속자 추적 + 입력 중 인디케이터

**두 데이터베이스의 규칙을 모두 풀어야 모든 기능이 정상 작동합니다.**
규칙이 잠겨 있으면 상단바 칩이 🟡 **로컬 전용** 으로 표시되며, LocalStorage 폴백으로 동작은 하지만 다른 매니저와의 실시간 동기화가 안 됩니다.

### Firestore 규칙
[콘솔 > Firestore > 규칙](https://console.firebase.google.com/project/gwj2-ob-staff-sheet/firestore/rules) :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

→ **"게시"** 버튼 클릭

### Realtime Database 규칙
[콘솔 > Realtime Database > 규칙](https://console.firebase.google.com/project/gwj2-ob-staff-sheet/database) :

```
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

→ **"게시"** 버튼 클릭

> 사내망 한정 운영 기준 임시 규칙. 추후 Firebase Auth + 닉네임/역할 기반으로 강화 가능.

---

## 🔄 실시간 동기화

상단바 우측의 **연결 상태 칩** 으로 현재 상태를 한눈에 확인:

| 표시 | 의미 |
|---|---|
| 🟢 **실시간** | Firebase 정상 — 다른 매니저와 실시간 동기화 중 |
| 🟡 **로컬 전용** | Firebase 미설정 또는 권한 규칙 잠김 — 본인 PC에만 저장 |
| 🟠 **오프라인** | 네트워크 끊김 — 로컬 저장 후 복구 시 자동 동기화 |

### 오프라인 자동 동기화 (v3)
- 오프라인/장애 중에 입력·삭제한 내용은 `pending` 레지스트리에 기록됩니다.
- 네트워크가 복구되면 (또는 다음 접속 시) **자동으로 Firebase 에 반영**됩니다.
- 한 PC에서 삭제한 행이 다른 PC에서 되살아나던 문제(좀비 행)도 서버 기준 정리로 해결됐습니다.

### 동시 편집 동작
- 다른 매니저가 같은 카드를 입력 중이면 카드 헤더에 **"OO 입력중..."** 배지가 보입니다.
- 다른 매니저가 같은 행을 수정 중이면 그 행 가장자리가 🟧 노란색으로 강조되고 👀 표시.
- 같은 셀을 두 사람이 거의 동시에 저장하려 하면 **충돌 경고 다이얼로그** 가 떠서 덮어쓸지 / 다른 사람 값을 유지할지 선택할 수 있습니다.
- 입력 중인 셀의 포커스는 다른 사람의 변경에 의해 사라지지 않습니다.

---

## 🐈 첫 사용

1. 닉네임 입력에 **`Bennett`** 으로 입장 (관리자)
2. DAY 또는 SWING 선택
3. **DATA → MANAGER** 탭에서 본인 + 매니저들 등록 (쿠코드 / 성함 / 닉네임)
4. **DATA → TEAM CAPTAIN** 탭에서 캡틴들 등록
5. 이후 등록한 닉네임으로 다른 매니저·캡틴이 바로 입장 가능

---

## ⌨ 입력 팁

| 동작 | 단축키 |
|---|---|
| 다음 셀로 이동 | `Tab` |
| 이전 셀로 | `Shift + Tab` |
| 같은 컬럼 다음 행 | `Enter` |
| 새 행 자동 추가 | 마지막 셀에서 `Tab` |
| 엑셀에서 다중 셀 붙여넣기 | 시작 셀 클릭 후 `Ctrl + V` |
| 선택된 행 복사 (TSV) | 행 체크 후 `Ctrl + C` |
| 행 다중 선택 (범위) | 첫 행 클릭 → 끝 행 `Shift + 클릭` |
| PACK/PICK 카드 검색 | 좌측 사이드의 🔎 검색창에 쿠코드/이름 입력 (ESC 로 초기화) |

PACK/PICK 의 행 우클릭 시:
- `Pack >` 호버 → 라인 선택해서 이동
- `Pick >` 호버 → 층/서브 선택해서 이동
- `복사` / `수정 이력` / `삭제`

---

## 👥 권한

| 역할 | 가능한 작업 |
|---|---|
| 일반 사용자 (등록 매니저·캡틴) | 모든 탭 입력 / 수정 |
| `Bennett` (관리자) | 위 + 행 삭제 + 카테고리 비우기 + DAY/SWING 백업·복원·초기화 + 마감시간 관리 + TC 포지션 편집 + 사원 특이사항 + **CSV 내보내기** |

---

## 📊 CSV / Excel 내보내기

관리자(Bennett) 의 ⚙ 설정 모달에서:
- **DATA** — 카테고리(MANAGER/CAPTAIN/PS/PERM/TEMP)별 마스터 내보내기
- **FLOW** — 날짜 범위 + 카테고리(캡틴/PS/조퇴/신규단기)별 내보내기
- **PACK / PICK** — 날짜 범위 + kind(pack/pick/pack_ws/pick_ws)별 내보내기
- **공유** — 현재 시업 집결지 보드 내보내기

모든 CSV 파일은 UTF-8 BOM 으로 저장되어 Excel 에서 한글이 깨지지 않습니다.

---

## 📁 폴더 구조

```
GW2OB PDA Sheet/
├── 시작.bat              ← 더블클릭으로 실행
├── server.js             ← Node 빌트인 정적 서버 (npm 의존성 없음)
├── index.html
├── README.md
├── css/
│   └── styles.css
└── js/
    ├── firebase-config.js  ← Firebase 키
    ├── app.js              ← 부트스트랩 + 라우팅
    ├── auth.js             ← 닉네임 인증
    ├── db.js               ← Firestore + LocalStorage 폴백 + subscribe* 실시간 구독 + 오프라인 pending 동기화
    ├── export.js           ← CSV/TSV 내보내기 헬퍼
    ├── capture.js          ← html2canvas 공용 캡처 (이미지 복사/PNG 저장)
    ├── theme.js            ← 라이트/다크 토글
    ├── character.js        ← 로그인 화면 고양이 SVG
    ├── toast.js
    ├── components/
    │   ├── grid.js              ← 편집 가능 그리드 (포커스 보존 patchRow/insertRow/removeRow)
    │   ├── multi-select.js
    │   ├── autocomplete.js      ← 커스텀 자동완성 드롭다운
    │   ├── pack-pick-grid.js    ← PACK/PICK 라인·층 카드 스트립 (SSOT, 검색, 충돌 경고, M/A/P)
    │   ├── member-label.js      ← 사원 라벨 색상 규칙 + 하이스킬 배지 + M/A/P 팩가능자 표시
    │   ├── member-card.js       ← 사원 정보 카드 모달
    │   ├── context-menu.js      ← 우클릭 메뉴 (서브메뉴 지원)
    │   ├── dialog.js            ← 사이트 톤 confirm/alert (ESC 지원)
    │   ├── audit-panel.js       ← 우하단 수정 이력 패널
    │   ├── presence.js          ← 실시간 접속자 (RTDB)
    │   ├── editing-presence.js  ← 입력 중 인디케이터 (RTDB · path 충돌 방지)
    │   ├── headcount-dashboard.js ← 인원현황 Plan/Actual 표 (자동 동기화)
    │   ├── headcount-chart.js   ← 채용률/Perm% 추이 차트 (SVG)
    │   └── clock.js             ← 시계 + 마감시간 (다음 날 안내 포함)
    └── views/
        ├── login.js
        ├── shift-pick.js
        ├── shell.js          ← 상단바 + 라우팅 + 연결상태 칩 + SNOP 검증
        ├── settings.js       ← Bennett 설정 모달 (CSV 내보내기 포함)
        ├── tab-data.js       ← DATA (마스터) + subscribeMaster
        ├── tab-headcount.js  ← 인원현황 대시보드 (이미지 복사/PNG 저장)
        ├── tab-flow.js       ← FLOW (일자 기록) + subscribeFlow
        ├── tab-pack.js       ← PACK (라인별)
        ├── tab-pick.js       ← PICK (층별)
        ├── tab-ws.js         ← W/S 워터 + subscribeOps(W/S kind)
        ├── tab-share.js      ← 공유 (계약직 시업 집결지) + subscribeShare + 보드 이미지 복사
        └── tab-tcpos.js      ← TC 포지션 (시업 보고용 보드) + subscribeTCPosition
```

---

## 🛠 데이터 모델 (Firestore)

```
masters/{shift}/{role}/{kucode}        # 인원 마스터
flows/{shift}/{type}/{auto}            # FLOW (일자별)
ops/{shift}/{kind}/{auto}              # PACK / PICK (kind: pack | pick | pack_ws | pick_ws)
share/{shift}/{kind}/{auto}            # 공유 (kind: pack | pick)
tcpos/{shift_date}                     # TC 포지션 (단일 문서)
specialNotes/{kucode}                  # 사원 특이사항
settings/deadlines                     # 마감시간 목록
settings/snop_{shift}_{date}           # 일자별 SNOP

audit/{auto}                           # 모든 변경 이력 — ts 단일 인덱스로 조회 (composite 불필요)
```

## Realtime Database

```
/presence/{sessionId} = { nickname, role, shift, joinedAt, lastActive }
/editing/{escapedScope}/{sessionId} = { nickname, ts, rowId }
```

`onDisconnect()` 으로 탭이 닫히면 자동 정리됩니다.

> `escapedScope` 는 점·슬래시·공백 등 RTDB 금지 문자를 고유 토큰으로 치환해서
> `"오토백 1.2"` 와 `"오토백 12"` 가 충돌하지 않도록 처리.

---

## 🧯 알려진 제한

- **Firebase Auth 미사용** — 닉네임 화이트리스트만으로 입장 제어. 사내망 한정 운영 전제.
- **Audit 인덱스 자동 생성** — `queryAudit` 는 `ts` 단일 인덱스만 사용해 composite index 가 필요 없습니다. (필터링은 클라이언트에서)
- **RAW 탭은 준비 중** — PACK/PICK HTP(시간당 처리량) 집계용 원본 데이터 영역. 향후 추가 예정.
- **모바일 반응형은 일부만** — 큰 화면(PC) 기준으로 설계. 태블릿 가로 모드 권장.

---

## 🔧 변경 로그 — v3 (동기화 신뢰성 + 팩가능자 표시)

- 🔴 **좀비 행 수정** — 한 PC에서 삭제한 행이 다른 PC의 로컬 미러 때문에 되살아나던 문제 해결 (서버 권위 기준 LS 정리)
- 🔴 **오프라인 자동 동기화 구현** — 오프라인 중 입력·삭제가 pending 레지스트리에 기록되고 복구 시 Firebase 로 자동 반영
- 🔴 **전체 초기화 보강** — Firestore 전용 문서(다른 PC에서만 입력된 데이터)도 빠짐없이 삭제
- 🔴 tab-data 중복 제거/비우기 후 구독·리스너 누수 수정, PACK/PICK 카드 재빌드 시 document 리스너 누수 수정
- 🔴 다른 사용자가 행을 다른 라인/층으로 옮겼을 때 옛 카드에 사본이 남던 문제 수정
- 🟢 **M/A/P 팩가능자 표시** — PACK/PICK/W·S 그리드에 메뉴얼(초록)/오토백(파랑)/AGV(분홍) 색 블록 컬럼
- 🟢 **하이스킬러 ⭐ 배지** — 이름 라벨 옆에 표시 (마우스 오버 시 보유 스킬)
- 🟢 공유 보드 색상 라벨 복원 (역할/스킬 색이 보드에도 적용) + 보드 이미지 복사/PNG 저장 버튼
- 🟢 모든 모달/다이얼로그 ESC 닫기, 위험 동작 다이얼로그는 "취소"에 기본 포커스
- 🟢 마감시간 시간순 정렬 + 중복 등록 방지, 지난 마감 표시 "D+5m" 형식 수정
- 🟢 쿠코드 없이 입력 시 "쿠코드를 먼저 입력하세요" 인라인 안내 (조용히 유실되던 문제)
- 🟢 SNOP 전일값 캐시 (키 입력마다 서버 조회하던 것 제거), 로그아웃 시 시계/접속자/연결칩 리소스 정리
- 🟢 인원현황 차트: 데이터 없는 구간이 0% 로 그려지던 문제 수정, 빠른 날짜 전환 레이스 가드

---

## 🔧 변경 로그 — v2 (실시간 협업 안정화)

- 🔴 PACK/PICK 외 모든 탭에도 실시간 구독 추가 (DATA / FLOW / 공유 / TC 포지션 / W/S)
- 🔴 다른 사용자 변경 시 **포커스/미커밋 입력 보존** (patchRow/insertRow/removeRow)
- 🔴 PACK 그룹명과 공유 시트 그룹명 SSOT 통일 ("메뉴얼 멀티" 표준화 + 옛 데이터 alias)
- 🔴 Editing presence path 충돌 버그 수정 ("오토백 1.2" ↔ "오토백 12")
- 🟢 연결 상태 칩 (실시간/로컬 전용/오프라인) 추가
- 🟢 충돌 경고 다이얼로그 (같은 셀 동시 편집)
- 🟢 PACK/PICK 카드별 검색 + 매칭 셀 하이라이트
- 🟢 CSV/Excel 내보내기 (UTF-8 BOM)
- 🟢 다음 날 마감시간 자동 안내
- 🟢 SNOP 천 단위 자동 포맷 + 검증
- 🟢 탭 전환 시 리스너/구독 자동 cleanup (메모리 누수 방지)
- 🟢 Audit 쿼리 단일 인덱스화 (composite index 없이 동작)
