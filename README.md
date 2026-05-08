# GWJ2 OB PDA 일지

쿠팡 GW2 OB팀 PDA 일지 — DAY조 / SWING조 운영 기록.

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
규칙이 잠겨 있어도 단일 PC LocalStorage 폴백으로 동작은 하지만, 다른 매니저와의 실시간 동기화가 안 됩니다.

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

규칙이 잠겨 있으면 화면 우상단 토스트로 빨간 안내가 뜹니다. 규칙을 푼 뒤 페이지를 새로고침하세요.

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

PACK/PICK 의 행 우클릭 시:
- `Pack >` 호버 → 라인 선택해서 이동
- `Pick >` 호버 → 층/서브 선택해서 이동
- `복사` / `수정 이력` / `삭제`

---

## 👥 권한

| 역할 | 가능한 작업 |
|---|---|
| 일반 사용자 (등록 매니저·캡틴) | 모든 탭 입력 / 수정 |
| `Bennett` (관리자) | 위 + 행 삭제 + 카테고리 비우기 + DAY/SWING 백업·복원·초기화 + 마감시간 관리 + TC 포지션 편집 + 사원 특이사항 |

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
    ├── db.js               ← Firestore + LocalStorage 폴백
    ├── theme.js            ← 라이트/다크 토글
    ├── character.js        ← 로그인 화면 고양이 SVG
    ├── toast.js
    ├── components/
    │   ├── grid.js              ← 편집 가능 그리드 (정렬, 붙여넣기, 라벨, 중복)
    │   ├── multi-select.js
    │   ├── pack-pick-grid.js    ← PACK/PICK 라인·층 카드 스트립
    │   ├── member-label.js      ← 사원 라벨 색상 규칙
    │   ├── member-card.js       ← 사원 정보 카드 모달
    │   ├── context-menu.js      ← 우클릭 메뉴 (서브메뉴 지원)
    │   ├── dialog.js            ← 사이트 톤 confirm/alert
    │   ├── audit-panel.js       ← 우하단 수정 이력 패널
    │   ├── presence.js          ← 실시간 접속자 (RTDB)
    │   └── clock.js             ← 시계 + 마감시간 효과
    └── views/
        ├── login.js
        ├── shift-pick.js
        ├── shell.js          ← 상단바 + 라우팅
        ├── settings.js       ← Bennett 설정 모달
        ├── tab-data.js       ← DATA (마스터)
        ├── tab-flow.js       ← FLOW (일자 기록)
        ├── tab-pack.js       ← PACK (라인별)
        ├── tab-pick.js       ← PICK (층별)
        ├── tab-ws.js         ← W/S 워터
        ├── tab-share.js      ← 공유 (계약직 시업 집결지)
        └── tab-tcpos.js      ← TC 포지션 (시업 보고용 보드)
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

audit/{auto}                           # 모든 변경 이력
```

## Realtime Database

```
/presence/{sessionId} = { nickname, role, shift, joinedAt, lastActive }
```

`onDisconnect()` 으로 탭이 닫히면 자동 정리됩니다.
