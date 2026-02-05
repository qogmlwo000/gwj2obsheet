# GWJ2 OB 인원시트 PDA Sheet

## 📋 프로젝트 개요

GWJ2 OB의 주간조(DAY)와 야간조(SWING) 인원을 실시간으로 관리하는 웹 기반 인원시트 도구입니다. Excel 파일의 한계를 극복하고, 다수의 관리자가 동시에 사용할 수 있도록 설계되었습니다.

## ✨ 주요 기능

### 1. 대시보드
- **실시간 인원 현황**: PACK, PICK, WS, Team Captain, Manager 인원 수 실시간 집계
- **SNOP 관리**: 일일 SNOP 목표 설정 및 주간 추이 차트
- **라이브 시계**: 현재 시각 및 날짜 표시
- **애니메이션 효과**: 카드별 순차적 등장 애니메이션

### 2. DATA (데이터 관리)
- **Manager**: 쿠코드 | 이름 | 닉네임
- **Team Captain**: 쿠코드 | 이름 | 닉네임 | 레벨
- **PS**: 쿠코드 | 이름 | 조
- **계약직**: 쿠코드 | 이름 | 조(A~Z) | 숙련도 | 포장 하이스킬 | 집품 하이스킬
- **단기직**: 쿠코드 | 이름 | 숙련도 | 포장 하이스킬 | 집품 하이스킬

### 3. PACK (포장)
**구역**: Autobag 1.2 / 2.5 / 4.0 / RTPB / 멀티, ManualPack / Multi, ACE, WS

- **구역별 실시간 카운터**: 각 구역에 배치된 인원 수 실시간 표시
- **검색 기능**: 쿠코드 또는 이름으로 실시간 검색
- **자동 정보 채우기**: 쿠코드 입력 시 이름, 상태, 숙련도 자동 표시
- **HTP 입력**: 구역별 개인 HTP 입력 및 저장
- **하이스킬 표시**: 포장 하이스킬 보유자에게 회전하는 빨간 테두리 효과

**숙련도 표시**:
- 🔵 **A** (파란색): Autobag 가능
- 🟠 **M** (주황색): Manual Pack 가능
- 🔴 **AGV** (분홍색): AGV 가능

### 4. PICK (집품)
**구역**: 6.1F / 6.3F / 7.1F / 7.2F / 7.3F / 8F / AGV / WS

- PACK과 동일한 기능 (하이스킬은 하늘색 테두리)
- 구역별 독립적인 인원 배치 및 HTP 관리

### 5. FLOW
- Manager / Team Captain / PS / 조퇴 업무 롤 부여
- Role(비고) 필드로 추가 정보 입력

### 6. 추가 기능
- **Excel 형식 복사/붙여넣기**: 
  - 테이블 내용을 드래그하여 복사 시 `쿠코드\t이름\t상태` 형식으로 클립보드에 복사
  - Excel에서 복사한 내용을 붙여넣기 시 자동 인식 및 배치
- **전체 초기화**: 비밀번호(1234) 확인 후 구역별 인원 전체 삭제
- **조 전환**: DAY/SWING 조 전환 시 데이터 독립 관리
- **테마 전환**: 라이트 모드 / 다크 모드 지원
- **로컬 저장**: 모든 데이터 브라우저 로컬스토리지에 자동 저장

## 🎨 UI/UX 특징

### 컬러 시스템
- **Primary**: #2563eb (파란색)
- **Secondary**: #7c3aed (보라색)
- **Success**: #10b981 (초록색)
- **Warning**: #f59e0b (주황색)
- **Danger**: #ef4444 (빨간색)

### 반응형 디자인
- 최소 너비 600px로 최적화된 그리드 레이아웃
- 가로 스크롤 지원으로 모든 정보 표시
- 테이블 고정 레이아웃으로 칸 크기 일관성 유지

### 애니메이션
- **대시보드 카드**: 순차적 등장 애니메이션 (100ms 간격)
- **하이스킬 테두리**: 2초 주기 회전 애니메이션
- **호버 효과**: 섹션 및 행에 transform 효과
- **차트**: 부드러운 선 그래프 애니메이션

## 🚀 사용 방법

### 시작하기
1. `index.html` 파일을 웹 브라우저로 열기
2. 좌측 상단 메뉴(☰) 버튼 클릭
3. DAY 또는 SWING 조 선택
4. 필요에 따라 라이트/다크 모드 전환

### 데이터 입력
1. **DATA 페이지**에서 Manager, TC, PS, 계약직, 단기직 정보 입력
2. **PACK/PICK 페이지**에서 쿠코드 입력 → 자동으로 이름, 상태, 숙련도 표시
3. HTP 값 직접 입력

### 인원 검색
- PACK/PICK 페이지 상단 검색창에 쿠코드 또는 이름 입력
- 해당 인원이 포함된 구역만 하이라이트 표시

### Excel 연동
- **복사**: 테이블 행을 드래그 선택 후 Ctrl+C → Excel에 붙여넣기
- **붙여넣기**: Excel에서 쿠코드, 이름, 상태 복사 → 테이블에 Ctrl+V

### 데이터 초기화
1. PACK 또는 PICK 페이지에서 "🔄 전체 초기화" 버튼 클릭
2. 비밀번호 **1234** 입력
3. 확인 버튼 클릭 → 해당 페이지의 모든 배치 삭제

## 📊 데이터 구조

### 상태 관리 (state)
```javascript
{
  currentShift: 'DAY' | 'SWING',
  currentPage: 'dashboard' | 'data' | 'flow' | 'pack' | 'pick' | 'raw' | 'share',
  managers: [{code, name, nickname}],
  teamCaptains: [{code, name, nickname, level}],
  ps: [{code, name, team}],
  contracts: [{code, name, team, skills[], packHighSkill, pickHighSkill}],
  temps: [{code, name, skills[], packHighSkill, pickHighSkill}],
  packAssignments: { 'autobag-1.2': [code, ...], ... },
  pickAssignments: { '6.1f': [code, ...], ... },
  packHTP: { 'autobag-1.2': [htp, ...], ... },
  pickHTP: { '6.1f': [htp, ...], ... },
  flowData: { managers: [], tcs: [], ps: [], earlyLeave: [] },
  snopData: [{date, snop, target}],
  todaySnop: number,
  hourlyTarget: number
}
```

### 로컬 스토리지 키
- **gwj2_pda_data**: DAY/SWING 조별 데이터 저장

## 🔧 기술 스택

- **HTML5**: 시맨틱 마크업
- **CSS3**: 변수, 그리드, Flexbox, 애니메이션
- **JavaScript (ES6+)**: 모듈 패턴, 이벤트 리스너, DOM 조작
- **Chart.js 4.4.0**: SNOP 추이 차트
- **LocalStorage API**: 브라우저 로컬 저장

## 🎯 향후 개선 사항

1. **Firebase 실시간 연동**: 다중 사용자 동시 편집 지원
2. **드래그 앤 드롭**: 마우스로 인원을 구역 간 이동
3. **통계 대시보드**: 숙련도별/조별 인원 분포 차트
4. **HTP RAW DATA**: 구역별/개인별 HTP 데이터 분석
5. **인쇄 레이아웃**: A4 용지에 최적화된 인쇄 스타일
6. **모바일 최적화**: 터치 인터페이스 및 작은 화면 지원
7. **데이터 내보내기**: Excel, CSV 형식 다운로드

## 📝 주요 변경 사항 (v1.1)

### 추가된 기능
✅ Zone별 실시간 인원 카운터  
✅ 검색 기능 (쿠코드/이름)  
✅ Excel 형식 복사/붙여넣기  
✅ HTP 입력 및 저장  
✅ 숙련도 세로 배치 (공간 효율성 향상)  
✅ 전체 페이지 가로 스크롤  
✅ 하이스킬 회전 테두리 애니메이션  

### 개선 사항
🔧 테이블 컬럼 비율 최적화 (쿠코드 18% / 이름 22% / 상태 28% / 숙련도 17% / HTP 15%)  
🔧 이름 칸 충분한 너비 확보 (3글자 이상 한 줄 표시)  
🔧 숙련도 뱃지 세로 배치로 HTP 칸 침범 방지  
🔧 localStorage에 packHTP, pickHTP 필드 추가  

## 🐛 알려진 이슈

- Firebase 연동 미구현 (현재 로컬스토리지만 사용)
- 모바일 환경에서 가로 스크롤 UX 개선 필요
- 대용량 데이터(200명 이상) 시 성능 최적화 필요

## 📞 문의

프로젝트 관련 문의나 버그 제보는 GWJ2 OB 관리팀으로 연락 바랍니다.

---

**Version**: 1.1.0  
**Last Updated**: 2026-02-04  
**Developed for**: GWJ2 OB Team
