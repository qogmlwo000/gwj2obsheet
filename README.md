# GWJ2 OB PDA 일지

쿠팡 GW2 OB팀 PDA 일지 — DAY조 / SWING조 운영 기록.

## 1. Firebase 셋업 (최초 1회)

1. https://console.firebase.google.com 에서 새 프로젝트 생성
2. 프로젝트 개요 → 웹 앱 추가 (`</>` 아이콘)
3. 표시되는 `firebaseConfig` 객체를 복사
4. 본 프로젝트의 `js/firebase-config.js` 파일을 열어 `firebaseConfig` 값을 붙여넣기
5. 좌측 메뉴 → **Firestore Database** → 데이터베이스 만들기 → **테스트 모드** 선택
6. 좌측 메뉴 → **Authentication** 은 사용하지 않음 (닉네임 인증만 사용)

### Firestore 보안 규칙 (시작 단계)

테스트 모드 기본값을 그대로 사용. 사내망 공유 가정.
운영 안정화 이후 강화 예정:

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

## 2. 로컬 실행

`index.html` 을 그냥 더블클릭하면 ES 모듈 import 가 차단됩니다.
간단한 정적 서버를 띄워주세요.

### 방법 A — Python
```
cd "GW2OB PDA Sheet"
python -m http.server 8080
```
브라우저에서 http://localhost:8080

### 방법 B — VS Code
Live Server 확장 설치 후 `index.html` 우클릭 → **Open with Live Server**

## 3. 첫 사용

1. 처음에는 DATA가 비어 있어 등록된 닉네임이 없습니다.
2. 닉네임 칸에 **`Bennett`** 을 입력하고 입장 (관리자)
3. DAY 또는 SWING 선택
4. **DATA → MANAGER** 탭에서 본인을 포함한 매니저들의 쿠코드 / 성함 / 닉네임을 등록
5. **DATA → TEAM CAPTAIN** 탭에서 캡틴들 등록
6. 이후 등록한 닉네임으로 다른 매니저·캡틴이 입장 가능

## 4. 데이터 입력 팁

- 엑셀에서 영역 복사 → 표 셀에 클릭 후 **Ctrl+V** 로 한 번에 붙여넣기
- **Tab / Shift+Tab** 으로 셀 이동, 마지막 셀에서 Tab 누르면 새 행 추가
- **Enter** 는 같은 컬럼 다음 행
- 하이스킬 / 특수 셀은 클릭하면 체크박스 드롭다운으로 다중 선택

## 5. 권한

| 역할 | 가능한 작업 |
|---|---|
| 일반 사용자 (등록 매니저·캡틴) | DATA·FLOW 입력 / 수정 |
| `Bennett` (관리자) | 위 + 행 삭제 + 전체 초기화 + 백업/복원 |
