// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyBB8Vz8WMeXR-am-HnBPVqtdqDKSUqoGuc",
    authDomain: "gwj2-ob-staff-sheet.firebaseapp.com",
    databaseURL: "https://gwj2-ob-staff-sheet-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "gwj2-ob-staff-sheet",
    storageBucket: "gwj2-ob-staff-sheet.firebasestorage.app",
    messagingSenderId: "130711981903",
    appId: "1:130711981903:web:84931fdcb18bdd1aa0ff3a"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 전역 변수
let currentShift = 'day';
let currentResetPage = '';

// 데이터 저장소
const dataStore = {
    managers: {},
    teamCaptains: {},
    ps: {},
    contract: {},
    temp: {},
    flow: {
        managers: {},
        teamCaptains: {},
        ps: {},
        leave: {}
    },
    pack: {
        autobag12: {},
        autobag25: {},
        autobag40: {},
        autobagRtpb: {},
        autobagMulti: {},
        manualPack: {},
        manualPackMulti: {},
        ace: {},
        packWs: {}
    },
    pick: {
        pick61f: {},
        pick63f: {},
        pick71f: {},
        pick72f: {},
        pick73f: {},
        pick8f: {},
        pickAgv: {},
        pickWs: {}
    }
};

// [수정] DOM 로드 시 초기화 부분
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    
    // 처음에 한번 전체 데이터를 가져오고, 그 뒤부터 실시간 모드로 전환
    const path = `shifts/${currentShift}`;
    
    database.ref(path).once('value').then(snapshot => {
        const val = snapshot.val();
        
        if (val) {
            // 1. 관리자, 계약직 등 명단 데이터 로드
            if (val.data) {
                Object.assign(dataStore, val.data);
            }
            
            // 2. 화면에 테이블 그리기
            refreshAllTables();
            
            // 3. 기존 배치된 인원 불러오기
            // (데이터가 있으면 배치도 불러옵니다)
            loadAssignmentData(); 
        }
        
        // 4. 이제부터 실시간 감지 시작!
        setupRealtimeListeners();
    });
});

// [추가] 실시간 데이터 동기화 리스너 (기존 loadDataFromFirebase 대체용)
function setupRealtimeListeners() {
    console.log("실시간 동기화 시작: " + currentShift);
    const shiftRef = database.ref(`shifts/${currentShift}`);

    // 1. DATA (관리자, TC, 계약직 목록 등) 변경 감지
    shiftRef.child('data').on('child_changed', (snapshot) => {
        const category = snapshot.key; // 예: managers, contract
        const data = snapshot.val();
        
        // 내 로컬 데이터 업데이트
        if (dataStore[category]) {
            dataStore[category] = data;
            
            // 해당 테이블만 새로고침 (전체 새로고침보다 효율적)
            if (category === 'managers') refreshDataTables(); // 편의상 전체 리프레시 호출
            else if (category === 'teamCaptains') refreshDataTables();
            else if (category === 'ps') refreshDataTables();
            else if (category === 'contract') refreshDataTables();
            else if (category === 'temp') refreshDataTables();
        }
    });

    // 2. ASSIGNMENTS (배치표) 변경 감지 - 가장 중요!
    shiftRef.child('assignments').on('child_changed', (snapshot) => {
        const pageType = snapshot.key; // pack 또는 pick
        const tables = snapshot.val(); // 해당 페이지의 모든 테이블 데이터
        
        if (!tables) return;

        // 변경된 테이블들을 순회
        Object.keys(tables).forEach(tableId => {
            const tableData = tables[tableId]; // 배열 데이터
            const tbody = document.getElementById(tableId);
            if (!tbody || !tableData) return;

            tableData.forEach(item => {
                const rows = tbody.querySelectorAll('tr');
                if (rows[item.index]) {
                    const row = rows[item.index];
                    const input = row.querySelector('.coop-code');
                    
                    // ★ 중요: 내가 지금 입력하고 있는 칸은 건드리지 않음 (충돌 방지)
                    if (document.activeElement !== input && input.value !== item.coopCode) {
                        // 값 업데이트
                        input.value = item.coopCode;
                        updateAssignmentRow(row, item.coopCode);
                        
                        // ✨ 반짝임 효과 (styles.css에 .highlight-update가 있어야 함)
                        row.classList.remove('highlight-update');
                        void row.offsetWidth; // 애니메이션 리셋 트릭
                        row.classList.add('highlight-update');
                    }
                }
            });
        });
        updateDashboard(); // 숫자 갱신
    });
}

// 앱 초기화
function initializeApp() {
    // 메뉴 아이템
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const page = this.getAttribute('data-page');
            navigateToPage(page);
            
            menuItems.forEach(mi => mi.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // 테마 토글
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.addEventListener('click', function() {
        this.classList.toggle('dark');
        document.body.setAttribute('data-theme', 
            this.classList.contains('dark') ? 'dark' : 'light'
        );
        saveThemePreference();
    });
    
    // 시프트 토글
    const shiftBtns = document.querySelectorAll('.shift-btn');
    shiftBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            shiftBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentShift = this.getAttribute('data-shift');
            updatePageTitle();
            loadDataFromFirebase();
        });
    });
    
    // 초기 테이블 생성
    initializeTables();
    
    // 저장된 테마 불러오기
    loadThemePreference();
}

// 페이지 네비게이션
function navigateToPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    const targetPage = document.getElementById(pageName + 'Page');
    if (targetPage) {
        targetPage.classList.add('active');
    }
}

// 페이지 타이틀 업데이트
function updatePageTitle() {
    const titleContainer = document.getElementById('pageTitleContainer');
    if (currentShift === 'day') {
        titleContainer.innerHTML = `
            <div class="title-badge">
                <span class="title-icon">☀️</span>
                <span class="badge-text">DAY SHIFT</span>
            </div>
            <h1 class="page-title">
                <span class="title-main">GWJ2 OB</span>
                <span class="title-sub">주간조 인원시트</span>
                <span class="title-tag">#DAY PDA Sheet</span>
            </h1>
            <div class="title-decoration">
                <div class="decoration-line"></div>
                <div class="decoration-dot"></div>
                <div class="decoration-dot"></div>
                <div class="decoration-dot"></div>
            </div>
        `;
    } else {
        titleContainer.innerHTML = `
            <div class="title-badge">
                <span class="title-icon">🌙</span>
                <span class="badge-text">SWING SHIFT</span>
            </div>
            <h1 class="page-title">
                <span class="title-main">GWJ2 OB</span>
                <span class="title-sub">야간조 인원시트</span>
                <span class="title-tag">#SWING PDA Sheet</span>
            </h1>
            <div class="title-decoration">
                <div class="decoration-line"></div>
                <div class="decoration-dot"></div>
                <div class="decoration-dot"></div>
                <div class="decoration-dot"></div>
            </div>
        `;
    }
}

// 테이블 초기화 (30개 행 미리 생성)
function initializeTables() {
    // DATA 페이지 테이블들은 필요시 추가 방식으로 유지
    
    // PACK 페이지 테이블
    const packTables = [
        'autobag12Table', 'autobag25Table', 'autobag40Table', 'autobagRtpbTable',
        'autobagMultiTable', 'manualPackTable', 'manualPackMultiTable', 'aceTable', 'packWsTable'
    ];
    
    packTables.forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            for (let i = 0; i < 30; i++) {
                tbody.appendChild(createAssignmentRow(tableId));
            }
        }
    });
    
    // PICK 페이지 테이블
    const pickTables = [
        'pick61fTable', 'pick63fTable', 'pick71fTable', 'pick72fTable',
        'pick73fTable', 'pick8fTable', 'pickAgvTable', 'pickWsTable'
    ];
    
    pickTables.forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            for (let i = 0; i < 30; i++) {
                tbody.appendChild(createAssignmentRow(tableId));
            }
        }
    });
    
    // FLOW 페이지 테이블
    const flowTables = ['flowManagerTable', 'flowTcTable', 'flowPsTable', 'flowLeaveTable'];
    flowTables.forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            for (let i = 0; i < 30; i++) {
                tbody.appendChild(createFlowRow(tableId));
            }
        }
    });
}

// DATA 행 추가
function addDataRow(type) {
    let tableId, row;
    
    switch(type) {
        case 'manager':
            tableId = 'managerDataTable';
            row = createManagerRow();
            break;
        case 'tc':
            tableId = 'tcDataTable';
            row = createTcRow();
            break;
        case 'ps':
            tableId = 'psDataTable';
            row = createPsRow();
            break;
        case 'contract':
            tableId = 'contractDataTable';
            row = createContractRow();
            break;
        case 'temp':
            tableId = 'tempDataTable';
            row = createTempRow();
            break;
    }
    
    const tbody = document.getElementById(tableId);
    tbody.appendChild(row);
}

// Manager 행 생성
function createManagerRow() {
    const tr = document.createElement('tr');
    const id = 'mgr_' + Date.now();
    tr.setAttribute('data-id', id);
    
    tr.innerHTML = `
        <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
        <td><input type="text" class="name" placeholder="이름"></td>
        <td><input type="text" class="nickname" placeholder="닉네임"></td>
        <td><button class="delete-btn" onclick="deleteDataRow(this, 'manager')">삭제</button></td>
    `;
    
    setupDataRowListeners(tr, 'manager');
    return tr;
}

// Team Captain 행 생성
function createTcRow() {
    const tr = document.createElement('tr');
    const id = 'tc_' + Date.now();
    tr.setAttribute('data-id', id);
    
    tr.innerHTML = `
        <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
        <td><input type="text" class="name" placeholder="이름"></td>
        <td><input type="text" class="nickname" placeholder="닉네임"></td>
        <td><input type="text" class="level" placeholder="레벨"></td>
        <td><button class="delete-btn" onclick="deleteDataRow(this, 'tc')">삭제</button></td>
    `;
    
    setupDataRowListeners(tr, 'tc');
    return tr;
}

// PS 행 생성
function createPsRow() {
    const tr = document.createElement('tr');
    const id = 'ps_' + Date.now();
    tr.setAttribute('data-id', id);
    
    tr.innerHTML = `
        <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
        <td><input type="text" class="name" placeholder="이름"></td>
        <td><input type="text" class="team" placeholder="조 (A, B, C...)"></td>
        <td><button class="delete-btn" onclick="deleteDataRow(this, 'ps')">삭제</button></td>
    `;
    
    setupDataRowListeners(tr, 'ps');
    return tr;
}

// 계약직 행 생성
function createContractRow() {
    const tr = document.createElement('tr');
    const id = 'cont_' + Date.now();
    tr.setAttribute('data-id', id);
    
    tr.innerHTML = `
        <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
        <td><input type="text" class="name" placeholder="이름"></td>
        <td><input type="text" class="team" placeholder="조 (A, B, C...)"></td>
        <td><input type="checkbox" class="autobag"></td>
        <td><input type="checkbox" class="manual"></td>
        <td><input type="checkbox" class="agv"></td>
        <td><input type="checkbox" class="pack-high"></td>
        <td><input type="checkbox" class="pick-high"></td>
        <td><button class="delete-btn" onclick="deleteDataRow(this, 'contract')">삭제</button></td>
    `;
    
    setupDataRowListeners(tr, 'contract');
    return tr;
}

// 단기직 행 생성
function createTempRow() {
    const tr = document.createElement('tr');
    const id = 'temp_' + Date.now();
    tr.setAttribute('data-id', id);
    
    tr.innerHTML = `
        <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
        <td><input type="text" class="name" placeholder="이름"></td>
        <td><input type="checkbox" class="autobag"></td>
        <td><input type="checkbox" class="manual"></td>
        <td><input type="checkbox" class="agv"></td>
        <td><input type="checkbox" class="pack-high"></td>
        <td><input type="checkbox" class="pick-high"></td>
        <td><button class="delete-btn" onclick="deleteDataRow(this, 'temp')">삭제</button></td>
    `;
    
    setupDataRowListeners(tr, 'temp');
    return tr;
}

// [수정 4-2단계] 배치 행 생성 함수 (이벤트 리스너 변경)
function createAssignmentRow(tableId) {
    const tr = document.createElement('tr');
    const id = tableId + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    tr.setAttribute('data-id', id);
    
    tr.innerHTML = `
        <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
        <td class="name-cell">-</td>
        <td class="status-cell">-</td>
        <td class="skill-cell">-</td>
        <td class="htp-cell">-</td>
    `;
    
    const coopCodeInput = tr.querySelector('.coop-code');
    
    // 1. 입력 중에는 화면만 갱신 (서버 부하 방지)
    coopCodeInput.addEventListener('input', function() {
        updateAssignmentRow(tr, this.value);
    });
    
    // 2. [핵심] 입력이 끝나면(엔터/포커스아웃) "그 줄만" 서버에 저장
    // 기존에는 여기서 saveAssignmentData()를 호출해서 전체를 덮어썼습니다.
    coopCodeInput.addEventListener('change', function() {
        // 현재 내가 몇 번째 줄인지 찾기 (0부터 시작)
        const rowIndex = Array.from(tr.parentNode.children).indexOf(tr);
        
        // 방금 만든 '한 줄 저장' 함수 호출
        saveSingleAssignment(tableId, rowIndex, this.value.trim());
        
        updateDashboard();
    });
    
    return tr;
}

// FLOW 행 생성
function createFlowRow(tableId) {
    const tr = document.createElement('tr');
    const id = tableId + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    tr.setAttribute('data-id', id);
    
    if (tableId === 'flowManagerTable') {
        tr.innerHTML = `
            <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
            <td class="name-cell">-</td>
            <td class="nickname-cell">-</td>
        `;
    } else if (tableId === 'flowTcTable') {
        tr.innerHTML = `
            <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
            <td class="nickname-cell">-</td>
            <td class="level-cell">-</td>
            <td><input type="text" class="role" placeholder="Role"></td>
        `;
    } else if (tableId === 'flowPsTable') {
        tr.innerHTML = `
            <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
            <td class="name-cell">-</td>
            <td class="status-cell">-</td>
            <td><input type="text" class="role" placeholder="Role"></td>
        `;
    } else if (tableId === 'flowLeaveTable') {
        tr.innerHTML = `
            <td><input type="text" class="coop-code" placeholder="쿠코드"></td>
            <td class="name-cell">-</td>
            <td class="status-cell">-</td>
            <td><input type="text" class="note" placeholder="비고"></td>
        `;
    }
    
    const coopCodeInput = tr.querySelector('.coop-code');
    coopCodeInput.addEventListener('input', function() {
        updateFlowRow(tr, this.value, tableId);
    });
    
    return tr;
}

// 데이터 행 리스너 설정
function setupDataRowListeners(tr, type) {
    const inputs = tr.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('change', function() {
            saveDataRow(tr, type);
        });
    });
}

// [수정 3단계] 데이터 행 핀포인트 저장 함수 (전체 덮어쓰기 방지)
function saveDataRow(tr, type) {
    const id = tr.getAttribute('data-id');
    const coopCode = tr.querySelector('.coop-code').value.trim();
    
    if (!coopCode) return;
    
    let data = { coopCode };
    let category = ''; // Firebase 저장 경로

    // 데이터 수집 (기존 로직과 동일)
    switch(type) {
        case 'manager':
            data.name = tr.querySelector('.name').value.trim();
            data.nickname = tr.querySelector('.nickname').value.trim();
            dataStore.managers[coopCode] = data;
            category = 'managers';
            break;
        case 'tc':
            data.name = tr.querySelector('.name').value.trim();
            data.nickname = tr.querySelector('.nickname').value.trim();
            data.level = tr.querySelector('.level').value.trim();
            dataStore.teamCaptains[coopCode] = data;
            category = 'teamCaptains';
            break;
        case 'ps':
            data.name = tr.querySelector('.name').value.trim();
            data.team = tr.querySelector('.team').value.trim().toUpperCase();
            dataStore.ps[coopCode] = data;
            category = 'ps';
            break;
        case 'contract':
            data.name = tr.querySelector('.name').value.trim();
            data.team = tr.querySelector('.team').value.trim().toUpperCase();
            data.autobag = tr.querySelector('.autobag').checked;
            data.manual = tr.querySelector('.manual').checked;
            data.agv = tr.querySelector('.agv').checked;
            data.packHigh = tr.querySelector('.pack-high').checked;
            data.pickHigh = tr.querySelector('.pick-high').checked;
            dataStore.contract[coopCode] = data;
            category = 'contract';
            break;
        case 'temp':
            data.name = tr.querySelector('.name').value.trim();
            data.autobag = tr.querySelector('.autobag').checked;
            data.manual = tr.querySelector('.manual').checked;
            data.agv = tr.querySelector('.agv').checked;
            data.packHigh = tr.querySelector('.pack-high').checked;
            data.pickHigh = tr.querySelector('.pick-high').checked;
            dataStore.temp[coopCode] = data;
            category = 'temp';
            break;
    }
    
    // [여기가 핵심] 전체 저장이 아니라, "이 사람 한 명"만 저장합니다.
    if (category) {
        const path = `shifts/${currentShift}/data/${category}/${coopCode}`;
        
        // update를 사용하여 안전하게 저장
        const updates = {};
        updates[path] = data;
        
        database.ref().update(updates)
            .then(() => {
                if(typeof showSyncStatus === 'function') showSyncStatus();
            })
            .catch(err => console.error("저장 실패", err));
    }
}

// 배치 행 업데이트
function updateAssignmentRow(tr, coopCode) {
    const nameCell = tr.querySelector('.name-cell');
    const statusCell = tr.querySelector('.status-cell');
    const skillCell = tr.querySelector('.skill-cell');
    
    if (!coopCode) {
        nameCell.textContent = '-';
        nameCell.className = 'name-cell'; // 클래스 초기화
        statusCell.textContent = '-';
        skillCell.innerHTML = '-';
        return;
    }
    
    // 데이터 조회
    let staffData = dataStore.contract[coopCode] || dataStore.temp[coopCode];
    
    if (!staffData) {
        nameCell.textContent = '미등록';
        nameCell.className = 'name-cell'; // 클래스 초기화
        statusCell.textContent = '-';
        skillCell.innerHTML = '-';
        return;
    }
    
    // 이름
    nameCell.textContent = staffData.name || '-';
    nameCell.className = 'name-cell'; // 먼저 초기화
    
    if (staffData.packHigh) {
        nameCell.classList.add('high-skill', 'pack-skill');
    }
    if (staffData.pickHigh) {
        nameCell.classList.add('high-skill', 'pick-skill');
    }
    
    // 상태
    if (dataStore.contract[coopCode]) {
        statusCell.innerHTML = `<span class="status-badge contract">계약직 - ${staffData.team}조</span>`;
    } else {
        statusCell.innerHTML = `<span class="status-badge temp">단기직</span>`;
    }
    
    // 숙련도
    let skillHTML = '<div class="skill-badges">';
    if (staffData.autobag) skillHTML += '<span class="skill-badge autobag">A</span>';
    if (staffData.manual) skillHTML += '<span class="skill-badge manual">M</span>';
    if (staffData.agv) skillHTML += '<span class="skill-badge agv">AGV</span>';
    skillHTML += '</div>';
    skillCell.innerHTML = skillHTML || '-';
    
    // 배치 데이터 저장
    saveAssignmentData();
    updateDashboard();
}

// FLOW 행 업데이트
function updateFlowRow(tr, coopCode, tableId) {
    if (!coopCode) {
        const nameCells = tr.querySelectorAll('.name-cell, .nickname-cell, .level-cell, .status-cell');
        nameCells.forEach(cell => cell.textContent = '-');
        return;
    }
    
    // Manager 조회
    if (dataStore.managers[coopCode]) {
        const data = dataStore.managers[coopCode];
        if (tr.querySelector('.name-cell')) tr.querySelector('.name-cell').textContent = data.name || '-';
        if (tr.querySelector('.nickname-cell')) tr.querySelector('.nickname-cell').textContent = data.nickname || '-';
        updateFlowCounts();
        return;
    }
    
    // Team Captain 조회
    if (dataStore.teamCaptains[coopCode]) {
        const data = dataStore.teamCaptains[coopCode];
        if (tr.querySelector('.name-cell')) tr.querySelector('.name-cell').textContent = data.name || '-';
        if (tr.querySelector('.nickname-cell')) tr.querySelector('.nickname-cell').textContent = data.nickname || '-';
        if (tr.querySelector('.level-cell')) tr.querySelector('.level-cell').textContent = data.level || '-';
        updateFlowCounts();
        return;
    }
    
    // PS 조회
    if (dataStore.ps[coopCode]) {
        const data = dataStore.ps[coopCode];
        if (tr.querySelector('.name-cell')) tr.querySelector('.name-cell').textContent = data.name || '-';
        if (tr.querySelector('.status-cell')) tr.querySelector('.status-cell').textContent = data.team ? `${data.team}조` : '-';
        updateFlowCounts();
        return;
    }
    
    // 일반 직원 조회 (계약직/단기직)
    const staffData = dataStore.contract[coopCode] || dataStore.temp[coopCode];
    if (staffData) {
        if (tr.querySelector('.name-cell')) tr.querySelector('.name-cell').textContent = staffData.name || '-';
        if (tr.querySelector('.status-cell')) {
            if (dataStore.contract[coopCode]) {
                tr.querySelector('.status-cell').textContent = `계약직 - ${staffData.team}조`;
            } else {
                tr.querySelector('.status-cell').textContent = '단기직';
            }
        }
        updateFlowCounts();
        return;
    }
    
    // 미등록
    if (tr.querySelector('.name-cell')) tr.querySelector('.name-cell').textContent = '미등록';
    updateFlowCounts();
}

// FLOW 카운트 업데이트
function updateFlowCounts() {
    // Manager 카운트
    let managerCount = 0;
    document.querySelectorAll('#flowManagerTable tr').forEach(tr => {
        const coopCode = tr.querySelector('.coop-code')?.value.trim();
        if (coopCode && dataStore.managers[coopCode]) managerCount++;
    });
    document.getElementById('flowManagerCount').textContent = managerCount;
    
    // TC 카운트
    let tcCount = 0;
    document.querySelectorAll('#flowTcTable tr').forEach(tr => {
        const coopCode = tr.querySelector('.coop-code')?.value.trim();
        if (coopCode && dataStore.teamCaptains[coopCode]) tcCount++;
    });
    document.getElementById('flowTcCount').textContent = tcCount;
    
    // PS 카운트
    let psCount = 0;
    document.querySelectorAll('#flowPsTable tr').forEach(tr => {
        const coopCode = tr.querySelector('.coop-code')?.value.trim();
        if (coopCode && dataStore.ps[coopCode]) psCount++;
    });
    document.getElementById('flowPsCount').textContent = psCount;
    
    // 조퇴 카운트
    let leaveCount = 0;
    document.querySelectorAll('#flowLeaveTable tr').forEach(tr => {
        const coopCode = tr.querySelector('.coop-code')?.value.trim();
        if (coopCode) leaveCount++;
    });
    document.getElementById('flowLeaveCount').textContent = leaveCount;
}

// 데이터 행 삭제
function deleteDataRow(btn, type) {
    const tr = btn.closest('tr');
    const coopCode = tr.querySelector('.coop-code').value.trim();
    
    if (coopCode) {
        switch(type) {
            case 'manager':
                delete dataStore.managers[coopCode];
                break;
            case 'tc':
                delete dataStore.teamCaptains[coopCode];
                break;
            case 'ps':
                delete dataStore.ps[coopCode];
                break;
            case 'contract':
                delete dataStore.contract[coopCode];
                break;
            case 'temp':
                delete dataStore.temp[coopCode];
                break;
        }
        saveDataToFirebase();
    }
    
    tr.remove();
}

// FLOW 행 삭제
function deleteFlowRow(btn) {
    const tr = btn.closest('tr');
    const coopCodeInput = tr.querySelector('.coop-code');
    if (coopCodeInput) {
        coopCodeInput.value = '';
    }
    const cells = tr.querySelectorAll('.name-cell, .nickname-cell, .level-cell, .status-cell');
    cells.forEach(cell => cell.textContent = '-');
    const roleInputs = tr.querySelectorAll('.role, .note');
    roleInputs.forEach(input => input.value = '');
}

// 페이지 초기화
function resetPage(page) {
    currentResetPage = page;
    document.getElementById('resetModal').classList.add('show');
}

function closeResetModal() {
    document.getElementById('resetModal').classList.remove('show');
    document.getElementById('resetPassword').value = '';
}

function confirmReset() {
    const password = document.getElementById('resetPassword').value;
    
    if (password !== '1234') {
        alert('비밀번호가 올바르지 않습니다.');
        return;
    }
    
    if (currentResetPage === 'pack') {
        const packTables = [
            'autobag12Table', 'autobag25Table', 'autobag40Table', 'autobagRtpbTable',
            'autobagMultiTable', 'manualPackTable', 'manualPackMultiTable', 'aceTable', 'packWsTable'
        ];
        
        packTables.forEach(tableId => {
            const tbody = document.getElementById(tableId);
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const coopCodeInput = row.querySelector('.coop-code');
                if (coopCodeInput) coopCodeInput.value = '';
                row.querySelector('.name-cell').textContent = '-';
                row.querySelector('.status-cell').textContent = '-';
                row.querySelector('.skill-cell').innerHTML = '-';
            });
        });
    } else if (currentResetPage === 'pick') {
        const pickTables = [
            'pick61fTable', 'pick63fTable', 'pick71fTable', 'pick72fTable',
            'pick73fTable', 'pick8fTable', 'pickAgvTable', 'pickWsTable'
        ];
        
        pickTables.forEach(tableId => {
            const tbody = document.getElementById(tableId);
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const coopCodeInput = row.querySelector('.coop-code');
                if (coopCodeInput) coopCodeInput.value = '';
                row.querySelector('.name-cell').textContent = '-';
                row.querySelector('.status-cell').textContent = '-';
                row.querySelector('.skill-cell').innerHTML = '-';
            });
        });
    }
    
    closeResetModal();
    saveAssignmentData();
    updateDashboard();
    alert('초기화가 완료되었습니다.');
}

// 대시보드 업데이트
function updateDashboard() {
    let packCount = 0;
    let pickCount = 0;
    let wsCount = 0;
    
    // PACK 카운트
    const packTables = [
        'autobag12Table', 'autobag25Table', 'autobag40Table', 'autobagRtpbTable',
        'autobagMultiTable', 'manualPackTable', 'manualPackMultiTable', 'aceTable'
    ];
    
    packTables.forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const coopCode = row.querySelector('.coop-code').value.trim();
                if (coopCode) packCount++;
            });
        }
    });
    
    // PICK 카운트
    const pickTables = [
        'pick61fTable', 'pick63fTable', 'pick71fTable', 'pick72fTable',
        'pick73fTable', 'pick8fTable', 'pickAgvTable'
    ];
    
    pickTables.forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const coopCode = row.querySelector('.coop-code').value.trim();
                if (coopCode) pickCount++;
            });
        }
    });
    
    // WS 카운트
    ['packWsTable', 'pickWsTable'].forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const coopCode = row.querySelector('.coop-code').value.trim();
                if (coopCode) wsCount++;
            });
        }
    });
    
    // TC, Manager 카운트
    const tcCount = Object.keys(dataStore.teamCaptains).length;
    const managerCount = Object.keys(dataStore.managers).length;
    
    // 대시보드 업데이트
    document.getElementById('packCount').textContent = packCount;
    document.getElementById('pickCount').textContent = pickCount;
    document.getElementById('wsCount').textContent = wsCount;
    document.getElementById('tcCount').textContent = tcCount;
    document.getElementById('managerCount').textContent = managerCount;
    
    // 총계
    const totalCount = packCount + pickCount;
    const contractCount = Object.keys(dataStore.contract).length;
    const tempCount = Object.keys(dataStore.temp).length;
    
    document.getElementById('totalCount').textContent = totalCount + '명';
    document.getElementById('contractCount').textContent = contractCount + '명';
    document.getElementById('tempCount').textContent = tempCount + '명';
}

// Firebase 저장
function saveDataToFirebase() {
    const path = `shifts/${currentShift}/data`;
    database.ref(path).set(dataStore)
        .catch(error => console.error('Firebase 저장 오류:', error));
}

// 배치 데이터 저장 (PACK/PICK)
function saveAssignmentData() {
    const assignmentData = {
        pack: {},
        pick: {}
    };
    
    // PACK 테이블 데이터 수집
    const packTables = [
        'autobag12Table', 'autobag25Table', 'autobag40Table', 'autobagRtpbTable',
        'autobagMultiTable', 'manualPackTable', 'manualPackMultiTable', 'aceTable', 'packWsTable'
    ];
    
    packTables.forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            assignmentData.pack[tableId] = [];
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((row, index) => {
                const coopCode = row.querySelector('.coop-code')?.value.trim();
                if (coopCode) {
                    assignmentData.pack[tableId].push({
                        index: index,
                        coopCode: coopCode
                    });
                }
            });
        }
    });
    
    // PICK 테이블 데이터 수집
    const pickTables = [
        'pick61fTable', 'pick63fTable', 'pick71fTable', 'pick72fTable',
        'pick73fTable', 'pick8fTable', 'pickAgvTable', 'pickWsTable'
    ];
    
    pickTables.forEach(tableId => {
        const tbody = document.getElementById(tableId);
        if (tbody) {
            assignmentData.pick[tableId] = [];
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((row, index) => {
                const coopCode = row.querySelector('.coop-code')?.value.trim();
                if (coopCode) {
                    assignmentData.pick[tableId].push({
                        index: index,
                        coopCode: coopCode
                    });
                }
            });
        }
    });
    
    // Firebase에 저장
    const path = `shifts/${currentShift}/assignments`;
    database.ref(path).set(assignmentData)
        .catch(error => console.error('배치 데이터 저장 오류:', error));
}

// 배치 데이터 불러오기
function loadAssignmentData() {
    const path = `shifts/${currentShift}/assignments`;
    database.ref(path).once('value')
        .then(snapshot => {
            const assignmentData = snapshot.val();
            if (!assignmentData) return;
            
            // PACK 데이터 복원
            if (assignmentData.pack) {
                Object.keys(assignmentData.pack).forEach(tableId => {
                    const tbody = document.getElementById(tableId);
                    if (tbody && assignmentData.pack[tableId]) {
                        assignmentData.pack[tableId].forEach(item => {
                            const rows = tbody.querySelectorAll('tr');
                            if (rows[item.index]) {
                                const input = rows[item.index].querySelector('.coop-code');
                                if (input) {
                                    input.value = item.coopCode;
                                    updateAssignmentRow(rows[item.index], item.coopCode);
                                }
                            }
                        });
                    }
                });
            }
            
            // PICK 데이터 복원
            if (assignmentData.pick) {
                Object.keys(assignmentData.pick).forEach(tableId => {
                    const tbody = document.getElementById(tableId);
                    if (tbody && assignmentData.pick[tableId]) {
                        assignmentData.pick[tableId].forEach(item => {
                            const rows = tbody.querySelectorAll('tr');
                            if (rows[item.index]) {
                                const input = rows[item.index].querySelector('.coop-code');
                                if (input) {
                                    input.value = item.coopCode;
                                    updateAssignmentRow(rows[item.index], item.coopCode);
                                }
                            }
                        });
                    }
                });
            }
            
            updateDashboard();
        })
        .catch(error => console.error('배치 데이터 불러오기 오류:', error));
}

// Firebase 불러오기
function loadDataFromFirebase() {
    const path = `shifts/${currentShift}/data`;
    database.ref(path).once('value')
        .then(snapshot => {
            const data = snapshot.val();
            if (data) {
                Object.assign(dataStore, data);
                refreshAllTables();
            }
            // 배치 데이터도 불러오기
            loadAssignmentData();
        })
        .catch(error => console.error('Firebase 불러오기 오류:', error));
}

// 모든 테이블 새로고침
function refreshAllTables() {
    // DATA 테이블 재생성
    refreshDataTables();
    
    // 배치 테이블 업데이트
    refreshAssignmentTables();
    
    // 대시보드 업데이트
    updateDashboard();
}

function refreshDataTables() {
    // Manager
    const managerTable = document.getElementById('managerDataTable');
    managerTable.innerHTML = '';
    Object.keys(dataStore.managers).forEach(coopCode => {
        const row = createManagerRow();
        const data = dataStore.managers[coopCode];
        row.querySelector('.coop-code').value = coopCode;
        row.querySelector('.name').value = data.name || '';
        row.querySelector('.nickname').value = data.nickname || '';
        managerTable.appendChild(row);
    });
    
    // Team Captain
    const tcTable = document.getElementById('tcDataTable');
    tcTable.innerHTML = '';
    Object.keys(dataStore.teamCaptains).forEach(coopCode => {
        const row = createTcRow();
        const data = dataStore.teamCaptains[coopCode];
        row.querySelector('.coop-code').value = coopCode;
        row.querySelector('.name').value = data.name || '';
        row.querySelector('.nickname').value = data.nickname || '';
        row.querySelector('.level').value = data.level || '';
        tcTable.appendChild(row);
    });
    
    // PS
    const psTable = document.getElementById('psDataTable');
    psTable.innerHTML = '';
    Object.keys(dataStore.ps).forEach(coopCode => {
        const row = createPsRow();
        const data = dataStore.ps[coopCode];
        row.querySelector('.coop-code').value = coopCode;
        row.querySelector('.name').value = data.name || '';
        row.querySelector('.team').value = data.team || '';
        psTable.appendChild(row);
    });
    
    // 계약직
    const contractTable = document.getElementById('contractDataTable');
    contractTable.innerHTML = '';
    Object.keys(dataStore.contract).forEach(coopCode => {
        const row = createContractRow();
        const data = dataStore.contract[coopCode];
        row.querySelector('.coop-code').value = coopCode;
        row.querySelector('.name').value = data.name || '';
        row.querySelector('.team').value = data.team || '';
        row.querySelector('.autobag').checked = data.autobag || false;
        row.querySelector('.manual').checked = data.manual || false;
        row.querySelector('.agv').checked = data.agv || false;
        row.querySelector('.pack-high').checked = data.packHigh || false;
        row.querySelector('.pick-high').checked = data.pickHigh || false;
        contractTable.appendChild(row);
    });
    
    // 단기직
    const tempTable = document.getElementById('tempDataTable');
    tempTable.innerHTML = '';
    Object.keys(dataStore.temp).forEach(coopCode => {
        const row = createTempRow();
        const data = dataStore.temp[coopCode];
        row.querySelector('.coop-code').value = coopCode;
        row.querySelector('.name').value = data.name || '';
        row.querySelector('.autobag').checked = data.autobag || false;
        row.querySelector('.manual').checked = data.manual || false;
        row.querySelector('.agv').checked = data.agv || false;
        row.querySelector('.pack-high').checked = data.packHigh || false;
        row.querySelector('.pick-high').checked = data.pickHigh || false;
        tempTable.appendChild(row);
    });
}

function refreshAssignmentTables() {
    // 모든 배치 테이블의 쿠코드 입력값을 기반으로 재업데이트
    const allTables = document.querySelectorAll('.assignment-table tbody');
    allTables.forEach(tbody => {
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
            const coopCodeInput = row.querySelector('.coop-code');
            if (coopCodeInput && coopCodeInput.value) {
                updateAssignmentRow(row, coopCodeInput.value);
            }
        });
    });
}

// 테마 저장
function saveThemePreference() {
    const theme = document.body.getAttribute('data-theme') || 'light';
    localStorage.setItem('theme', theme);
}

// 테마 불러오기
function loadThemePreference() {
    const theme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', theme);
    const themeToggle = document.getElementById('themeToggle');
    if (theme === 'dark') {
        themeToggle.classList.add('dark');
    }
}

// 복사 기능 개선 (테이블 셀 선택 지원)
document.addEventListener('copy', function(e) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // 테이블 내부인지 확인
    let table = container.nodeType === 3 
        ? container.parentElement.closest('table') 
        : container.closest('table');
    
    if (!table || !table.classList.contains('assignment-table')) return;
    
    e.preventDefault();
    
    // 선택된 영역의 모든 행 수집
    const selectedRows = [];
    const fragment = range.cloneContents();
    
    // 직접 선택된 행들 찾기
    let currentElement = range.startContainer;
    while (currentElement && currentElement !== range.endContainer) {
        if (currentElement.nodeType === 1) {
            const row = currentElement.closest('tr');
            if (row && !selectedRows.includes(row)) {
                selectedRows.push(row);
            }
        }
        currentElement = getNextNode(currentElement, range.endContainer);
    }
    
    // 끝 컨테이너의 행도 추가
    const endRow = range.endContainer.nodeType === 3
        ? range.endContainer.parentElement.closest('tr')
        : range.endContainer.closest('tr');
    if (endRow && !selectedRows.includes(endRow)) {
        selectedRows.push(endRow);
    }
    
    // 데이터 추출
    const copyData = [];
    selectedRows.forEach(row => {
        const coopCodeInput = row.querySelector('.coop-code');
        const nameCell = row.querySelector('.name-cell');
        const statusCell = row.querySelector('.status-cell');
        
        if (coopCodeInput && nameCell && statusCell) {
            const coopCode = coopCodeInput.value.trim();
            const name = nameCell.textContent.trim();
            const status = statusCell.textContent.trim();
            
            if (coopCode && name !== '-' && name !== '미등록') {
                // 상태에서 status-badge 제거하고 텍스트만 추출
                let cleanStatus = status;
                const statusBadge = statusCell.querySelector('.status-badge');
                if (statusBadge) {
                    cleanStatus = statusBadge.textContent.trim();
                }
                
                copyData.push(`${coopCode}\t${name}\t${cleanStatus}`);
            }
        }
    });
    
    if (copyData.length > 0) {
        e.clipboardData.setData('text/plain', copyData.join('\n'));
    } else {
        // 일반 텍스트 복사
        e.clipboardData.setData('text/plain', selection.toString());
    }
});

// 트리 순회를 위한 헬퍼 함수
function getNextNode(node, endNode) {
    if (node === endNode) return null;
    
    if (node.firstChild) return node.firstChild;
    
    while (node) {
        if (node === endNode) return null;
        if (node.nextSibling) return node.nextSibling;
        node = node.parentNode;
    }
    
    return null;
}

// [수정 4-1단계] 단일 배치 셀 저장 함수 (새로 추가)
function saveSingleAssignment(tableId, index, coopCode) {
    // 테이블 ID로 pack인지 pick인지 구분
    let pageType = 'pack';
    if (tableId.includes('pick')) pageType = 'pick';
    
    // 배열의 특정 인덱스(몇 번째 줄)만 콕 집어서 업데이트
    const path = `shifts/${currentShift}/assignments/${pageType}/${tableId}/${index}`;
    
    database.ref(path).set({
        index: index,
        coopCode: coopCode
    }).then(() => {
        if(typeof showSyncStatus === 'function') showSyncStatus();
    }).catch(err => console.error(err));
}

// [추가] 데이터 저장 성공 시 알림 표시
function showSyncStatus() {
    let statusEl = document.querySelector('.sync-status');
    // 요소가 없으면 새로 생성
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'sync-status';
        statusEl.textContent = '클라우드 자동 저장됨 ☁️';
        document.body.appendChild(statusEl);
    }
    
    // 스타일이 없으면 JS로 임시 주입 (CSS파일 수정을 놓쳤을 경우 대비)
    if (!statusEl.getAttribute('style')) {
        statusEl.style.cssText = 'position:fixed; bottom:20px; right:20px; padding:8px 12px; background:rgba(0,0,0,0.7); color:white; border-radius:20px; z-index:9999; font-size:12px; pointer-events:none; opacity:0; transition:opacity 0.3s;';
    }

    // 표시 애니메이션
    statusEl.style.opacity = '1';
    setTimeout(() => {
        statusEl.style.opacity = '0';
    }, 2000);
}