// Firebase 설정 (실제 프로젝트 설정으로 교체 필요)
const firebaseConfig = {
    apiKey: "AIzaSyBB8Vz8WMeXR-am-HnBPVqtdqDKSUqoGuc",
    authDomain: "gwj2-ob-staff-sheet.firebaseapp.com",
    databaseURL: "https://gwj2-ob-staff-sheet-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "gwj2-ob-staff-sheet",
    storageBucket: "gwj2-ob-staff-sheet.firebasestorage.app",
    messagingSenderId: "130711981903",
    appId: "1:130711981903:web:84931fdcb18bdd1aa0ff3a"
};

// 전역 상태 관리
const state = {
    currentShift: 'DAY',
    currentPage: 'dashboard',
    managers: [],
    teamCaptains: [],
    ps: [],
    contracts: [],
    temps: [],
    packAssignments: {},
    pickAssignments: {},
    packHTP: {},
    pickHTP: {},
    packNotes: {},
    pickNotes: {},
    flowData: {
        managers: [],
        tcs: [],
        ps: [],
        earlyLeave: []
    },
    snopData: [],
    todaySnop: 0,
    hourlyTarget: 0,
    searchQuery: '',
    activeFilter: 'all'
};

let snopChart = null;

// 디바운스 타이머
let packRenderTimeout = null;
let pickRenderTimeout = null;
const RENDER_DELAY = 300; // 입력 완료 후 렌더링까지 대기 시간 (ms)

// 자동완성 관련 플래그
let isAutocompletePending = false;

// 로컬 스토리지 키
const STORAGE_KEY = 'gwj2_pda_data';
const FIREBASE_CONFIG_KEY = 'gwj2_firebase_config';

// Firebase 관련 변수
let firebaseApp = null;
let firebaseDb = null;
let firebaseConnected = false;
let currentRoomName = 'gwj2-day';
let syncListeners = [];
let isRemoteUpdate = false; // 원격 업데이트 중인지 플래그
let lastSyncTime = null;
let syncDebounceTimer = null;
const SYNC_DEBOUNCE_DELAY = 100; // 동기화 디바운스 (ms)

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    loadFromLocalStorage();
    renderAllTables();
    updateDashboard();
    initializeClock();
    initializeChart();
    loadSnopData();
    initializeFirebase();
});

// 앱 초기화
function initializeApp() {
    setupMenuToggle();
    setupBottomNav();
    setupShiftToggle();
    setupThemeToggle();
    setupPageNavigation();
    setupResetButtons();
    setupContextMenu();
    setupAutocomplete();
    setupSnopSave();
    setupSearch();
    setupCopyPaste();
    setupFirebaseUI();
    setupDragAndDrop();
    setupActivityFeed();
    setupPresenceSystem();
}

// 드래그 앤 드롭 전역 변수
let draggedItem = null;
let draggedCode = null;
let draggedFromZone = null;
let draggedFromType = null; // 'pack' or 'pick'

// 메뉴 토글
function setupMenuToggle() {
    const menuBtn = document.getElementById('menuBtn');
    const closeMenuBtn = document.getElementById('closeMenuBtn');
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');

    menuBtn.addEventListener('click', () => {
        sideMenu.classList.add('active');
        if (menuOverlay) menuOverlay.classList.add('active');
    });

    const closeMenu = () => {
        sideMenu.classList.remove('active');
        if (menuOverlay) menuOverlay.classList.remove('active');
    };

    closeMenuBtn.addEventListener('click', closeMenu);
    if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);
}

// 하단 네비게이션
function setupBottomNav() {
    const bottomNav = document.getElementById('bottomNav');
    if (!bottomNav) return;

    bottomNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.bottom-nav-item');
        if (!btn) return;
        const pageId = btn.dataset.page;
        if (pageId) navigateToPage(pageId);
    });
}

// 조 변경
function setupShiftToggle() {
    const dayShift = document.getElementById('dayShift');
    const swingShift = document.getElementById('swingShift');

    function updateShiftUI(shift) {
        const shiftEmoji = document.querySelector('.shift-emoji');
        const shiftText = document.getElementById('shiftText');
        const shiftBadge = document.getElementById('shiftBadge');

        if (shift === 'DAY') {
            if (shiftEmoji) shiftEmoji.textContent = '\u2600\uFE0F';
            if (shiftText) shiftText.textContent = 'DAY';
            if (shiftBadge) shiftBadge.textContent = '#DAY';
            dayShift.classList.add('active');
            swingShift.classList.remove('active');
        } else {
            if (shiftEmoji) shiftEmoji.textContent = '\uD83C\uDF19';
            if (shiftText) shiftText.textContent = 'SWING';
            if (shiftBadge) shiftBadge.textContent = '#SWING';
            swingShift.classList.add('active');
            dayShift.classList.remove('active');
        }
    }

    dayShift.addEventListener('click', () => {
        state.currentShift = 'DAY';
        updateShiftUI('DAY');
        loadFromLocalStorage();
        renderAllTables();
        updateDashboard();
    });

    swingShift.addEventListener('click', () => {
        state.currentShift = 'SWING';
        updateShiftUI('SWING');
        loadFromLocalStorage();
        renderAllTables();
        updateDashboard();
    });
}

// 테마 토글
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeText = themeToggle.querySelector('.theme-text');
    const body = document.body;

    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        body.classList.remove('light-mode');
        themeIcon.textContent = '\u2600\uFE0F';
        themeText.textContent = '라이트 모드';
    } else {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        themeIcon.textContent = '\uD83C\uDF19';
        themeText.textContent = '다크 모드';
    }

    themeToggle.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            themeIcon.textContent = '\uD83C\uDF19';
            themeText.textContent = '다크 모드';
            localStorage.setItem('theme', 'light');
        } else {
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            themeIcon.textContent = '\u2600\uFE0F';
            themeText.textContent = '라이트 모드';
            localStorage.setItem('theme', 'dark');
        }
    });
}

// 페이지 네비게이션
function setupPageNavigation() {
    const menuLinks = document.querySelectorAll('.menu-list a');

    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = link.dataset.page;
            if (pageId) navigateToPage(pageId);
        });
    });
}

// 초기화 버튼
function setupResetButtons() {
    const resetPackBtn = document.getElementById('resetPackBtn');
    const resetPickBtn = document.getElementById('resetPickBtn');
    const modal = document.getElementById('modal');
    const confirmReset = document.getElementById('confirmReset');
    const cancelReset = document.getElementById('cancelReset');
    const resetPassword = document.getElementById('resetPassword');

    let resetType = null;

    resetPackBtn.addEventListener('click', () => {
        resetType = 'pack';
        modal.classList.add('active');
        resetPassword.value = '';
        resetPassword.focus();
    });

    resetPickBtn.addEventListener('click', () => {
        resetType = 'pick';
        modal.classList.add('active');
        resetPassword.value = '';
        resetPassword.focus();
    });

    confirmReset.addEventListener('click', () => {
        if (resetPassword.value === '1234') {
            if (resetType === 'pack') {
                state.packAssignments = {};
                state.packHTP = {};
                renderPackTables();
            } else if (resetType === 'pick') {
                state.pickAssignments = {};
                state.pickHTP = {};
                renderPickTables();
            }
            saveToLocalStorage();
            updateDashboard();
            modal.classList.remove('active');
        } else {
            alert('비밀번호가 올바르지 않습니다.');
        }
    });

    cancelReset.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    resetPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmReset.click();
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

// 드래그 앤 드롭 설정
function setupDragAndDrop() {
    // 드롭 영역 설정 (PACK/PICK 섹션들)
    document.querySelectorAll('.pack-section, .pick-section').forEach(section => {
        section.addEventListener('dragover', handleDragOver);
        section.addEventListener('dragenter', handleDragEnter);
        section.addEventListener('dragleave', handleDragLeave);
        section.addEventListener('drop', handleDrop);
    });
}

// 행에 드래그 이벤트 설정 (테이블 렌더링 시 호출)
function setupRowDragEvents(row, code, zone, type) {
    if (!code) return;

    row.setAttribute('draggable', 'true');
    row.classList.add('draggable-row');

    row.addEventListener('dragstart', (e) => {
        draggedItem = row;
        draggedCode = code;
        draggedFromZone = zone;
        draggedFromType = type;

        row.classList.add('dragging');

        // 드래그 이미지 설정
        const person = findPersonByCode(code);
        const name = person?.name || code;

        // 고스트 이미지 생성
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = `${name}`;
        ghost.style.position = 'absolute';
        ghost.style.top = '-1000px';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);

        setTimeout(() => ghost.remove(), 0);

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', code);
    });

    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        draggedItem = null;
        draggedCode = null;
        draggedFromZone = null;
        draggedFromType = null;

        // 모든 드롭 하이라이트 제거
        document.querySelectorAll('.drop-target').forEach(el => {
            el.classList.remove('drop-target');
        });
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    const section = e.currentTarget;
    section.classList.add('drop-target');
}

function handleDragLeave(e) {
    const section = e.currentTarget;
    // relatedTarget이 section 내부에 있으면 무시
    if (section.contains(e.relatedTarget)) return;
    section.classList.remove('drop-target');
}

function handleDrop(e) {
    e.preventDefault();
    const section = e.currentTarget;
    section.classList.remove('drop-target');

    if (!draggedCode || !draggedFromZone) return;

    const targetZone = section.dataset.zone;
    const targetType = section.classList.contains('pack-section') ? 'pack' : 'pick';

    // 같은 구역이면 무시
    if (targetZone === draggedFromZone && targetType === draggedFromType) return;

    // 이동 처리
    movePersonToZone(draggedCode, draggedFromZone, draggedFromType, targetZone, targetType);
}

function movePersonToZone(code, fromZone, fromType, toZone, toType) {
    // 원래 위치에서 제거
    const fromAssignments = fromType === 'pack' ? state.packAssignments : state.pickAssignments;
    const fromHTP = fromType === 'pack' ? state.packHTP : state.pickHTP;

    if (fromAssignments[fromZone]) {
        const index = fromAssignments[fromZone].indexOf(code);
        if (index !== -1) {
            fromAssignments[fromZone].splice(index, 1);
            if (fromHTP[fromZone]) {
                fromHTP[fromZone].splice(index, 1);
            }
        }
    }

    // 새 위치에 추가
    const toAssignments = toType === 'pack' ? state.packAssignments : state.pickAssignments;
    if (!toAssignments[toZone]) toAssignments[toZone] = [];

    // 첫 번째 빈 칸 찾기
    let emptyIndex = toAssignments[toZone].findIndex(c => !c || !c.trim());
    if (emptyIndex === -1) {
        emptyIndex = toAssignments[toZone].length;
    }
    toAssignments[toZone][emptyIndex] = code;

    // 테이블 재렌더링
    renderPackTables();
    renderPickTables();
    saveToLocalStorage();
    updateDashboard();

    // 알림
    const person = findPersonByCode(code);
    const name = person?.name || code;
    const toZoneName = getZoneName(toZone);
    showNotification(`✅ ${name}님을 ${toZoneName}(으)로 이동했습니다!`, 'success');
}

// 컨텍스트 메뉴 설정
function setupContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    let selectedRow = null;
    let selectedZone = null;
    let selectedCode = null;
    let isPack = false;

    document.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('.work-table tbody tr');
        if (row) {
            const codeInput = row.querySelector('td:first-child input');
            const code = codeInput?.value?.trim();
            
            if (code) {
                e.preventDefault();
                selectedRow = row;
                selectedCode = code;
                
                const packSection = row.closest('.pack-section');
                const pickSection = row.closest('.pick-section');
                const section = packSection || pickSection;
                
                if (!section) {
                    console.error('Section not found');
                    return;
                }
                
                selectedZone = section.dataset.zone;
                isPack = packSection !== null;
                
                console.log('Context menu:', { code, zone: selectedZone, isPack });
                
                // 컨텍스트 메뉴 내용 업데이트
                updateContextMenu(isPack, selectedZone);
                
                // 먼저 메뉴를 보이게 해서 실제 크기 측정
                contextMenu.style.display = 'block';
                contextMenu.style.visibility = 'hidden';
                
                // 실제 메뉴 크기 측정
                const menuRect = contextMenu.getBoundingClientRect();
                const menuWidth = menuRect.width || 250;
                const menuHeight = menuRect.height || 400;
                
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                // clientX/Y 사용 (viewport 기준)
                let left = e.clientX;
                let top = e.clientY;
                
                console.log('Initial position:', { clientX: e.clientX, clientY: e.clientY, pageX: e.pageX, pageY: e.pageY });
                
                // 오른쪽 경계 체크
                if (left + menuWidth > viewportWidth) {
                    left = Math.max(5, viewportWidth - menuWidth - 5);
                }
                
                // 하단 경계 체크
                if (top + menuHeight > viewportHeight) {
                    top = Math.max(5, viewportHeight - menuHeight - 5);
                }
                
                // 왼쪽/상단 최소값 보정
                left = Math.max(5, left);
                top = Math.max(5, top);
                
                contextMenu.style.left = left + 'px';
                contextMenu.style.top = top + 'px';
                contextMenu.style.visibility = 'visible';
                contextMenu.classList.add('active');
                
                console.log('Final menu position:', { 
                    left, 
                    top, 
                    menuWidth, 
                    menuHeight, 
                    viewportWidth, 
                    viewportHeight,
                    hasActiveClass: contextMenu.classList.contains('active')
                });
            }
        }
    });

    document.addEventListener('click', () => {
        contextMenu.classList.remove('active');
        contextMenu.style.display = 'none';
    });

    contextMenu.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        
        if (action === 'delete' && selectedCode) {
            deleteFromZone(selectedCode, selectedZone, isPack);
        } else if (action?.startsWith('move-pack-') && selectedCode) {
            const targetZone = action.replace('move-pack-', '');
            moveToZone(selectedCode, selectedZone, targetZone, isPack, false);
        } else if (action?.startsWith('move-pick-') && selectedCode) {
            const targetZone = action.replace('move-pick-', '');
            moveToZone(selectedCode, selectedZone, targetZone, isPack, true);
        }
        
        contextMenu.classList.remove('active');
    });
}

function updateContextMenu(isPack, currentZone) {
    const contextMenu = document.getElementById('contextMenu');
    
    const packZones = ['autobag-1.2', 'autobag-2.5', 'autobag-4.0', 'autobag-rtpb', 'autobag-multi', 'manualpack', 'manualpack-multi', 'ace', 'ws'];
    const pickZones = ['6.1f', '6.3f', '7.1f', '7.2f', '7.3f', '8f', 'agv', 'ws'];
    
    const packZoneNames = {
        'autobag-1.2': 'Autobag 1.2',
        'autobag-2.5': 'Autobag 2.5',
        'autobag-4.0': 'Autobag 4.0',
        'autobag-rtpb': 'Autobag RTPB',
        'autobag-multi': 'Autobag 멀티',
        'manualpack': 'ManualPack',
        'manualpack-multi': 'ManualPack Multi',
        'ace': 'ACE',
        'ws': 'WS (워터)'
    };
    
    const pickZoneNames = {
        '6.1f': '6.1F',
        '6.3f': '6.3F',
        '7.1f': '7.1F',
        '7.2f': '7.2F',
        '7.3f': '7.3F',
        '8f': '8F',
        'agv': 'AGV',
        'ws': 'WS (워터)'
    };
    
    let html = '<div class="context-item" data-action="delete">🗑️ 삭제</div>';
    html += '<div class="context-divider"></div>';
    
    // 현재 층 내 다른 구역
    if (isPack) {
        html += '<div class="context-label">📦 PACK 다른 구역으로 이동</div>';
        packZones.forEach(zone => {
            if (zone !== currentZone) {
                html += `<div class="context-item move-item" data-action="move-pack-${zone}">→ ${packZoneNames[zone]}</div>`;
            }
        });
        
        html += '<div class="context-divider"></div>';
        html += '<div class="context-label">🎯 PICK으로 이동</div>';
        pickZones.forEach(zone => {
            html += `<div class="context-item move-item" data-action="move-pick-${zone}">→ ${pickZoneNames[zone]}</div>`;
        });
    } else {
        html += '<div class="context-label">🎯 PICK 다른 구역으로 이동</div>';
        pickZones.forEach(zone => {
            if (zone !== currentZone) {
                html += `<div class="context-item move-item" data-action="move-pick-${zone}">→ ${pickZoneNames[zone]}</div>`;
            }
        });
        
        html += '<div class="context-divider"></div>';
        html += '<div class="context-label">📦 PACK으로 이동</div>';
        packZones.forEach(zone => {
            html += `<div class="context-item move-item" data-action="move-pack-${zone}">→ ${packZoneNames[zone]}</div>`;
        });
    }
    
    contextMenu.innerHTML = html;
}

function deleteFromZone(code, zone, isPack) {
    const assignments = isPack ? state.packAssignments : state.pickAssignments;
    const htp = isPack ? state.packHTP : state.pickHTP;
    
    if (assignments[zone]) {
        const index = assignments[zone].indexOf(code);
        if (index !== -1) {
            assignments[zone].splice(index, 1);
            if (htp[zone]) {
                htp[zone].splice(index, 1);
            }
        }
    }
    
    if (isPack) {
        renderPackTables();
    } else {
        renderPickTables();
    }
    
    saveToLocalStorage();
    updateDashboard();
    showNotification('✅ 삭제되었습니다!', 'success');
}

function moveToZone(code, fromZone, toZone, fromIsPack, toIsPick) {
    const fromAssignments = fromIsPack ? state.packAssignments : state.pickAssignments;
    const fromHTP = fromIsPack ? state.packHTP : state.pickHTP;
    
    // 원래 구역에서 제거
    if (fromAssignments[fromZone]) {
        const index = fromAssignments[fromZone].indexOf(code);
        if (index !== -1) {
            fromAssignments[fromZone].splice(index, 1);
            if (fromHTP[fromZone]) {
                fromHTP[fromZone].splice(index, 1);
            }
        }
    }
    
    // 새 구역에 추가
    const toAssignments = toIsPick ? state.pickAssignments : state.packAssignments;
    if (!toAssignments[toZone]) toAssignments[toZone] = [];
    const emptyIndex = getFirstEmptyIndex(toAssignments[toZone]);
    toAssignments[toZone][emptyIndex] = code;
    
    // 테이블 재렌더링
    renderPackTables();
    renderPickTables();
    
    saveToLocalStorage();
    updateDashboard();
    
    const toType = toIsPick ? 'PICK' : 'PACK';
    showNotification(`✅ ${toType}으로 이동되었습니다!`, 'success');
}

// 로컬 스토리지 저장
function saveToLocalStorage() {
    const data = {
        [state.currentShift]: {
            managers: state.managers,
            teamCaptains: state.teamCaptains,
            ps: state.ps,
            contracts: state.contracts,
            temps: state.temps,
            packAssignments: state.packAssignments,
            pickAssignments: state.pickAssignments,
            packHTP: state.packHTP,
            pickHTP: state.pickHTP,
            packNotes: state.packNotes,
            pickNotes: state.pickNotes,
            flowData: state.flowData,
            snopData: state.snopData,
            todaySnop: state.todaySnop,
            hourlyTarget: state.hourlyTarget
        }
    };

    const existingData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({...existingData, ...data}));

    // Firebase 실시간 동기화
    if (firebaseConnected && !isRemoteUpdate) {
        syncToFirebase('packAssignments', state.packAssignments);
        syncToFirebase('pickAssignments', state.pickAssignments);
        syncToFirebase('packHTP', state.packHTP);
        syncToFirebase('pickHTP', state.pickHTP);
        syncToFirebase('packNotes', state.packNotes);
        syncToFirebase('pickNotes', state.pickNotes);
        syncToFirebase('contracts', state.contracts);
        syncToFirebase('temps', state.temps);
    }
}

// 로컬 스토리지 로드
function loadFromLocalStorage() {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const shiftData = data[state.currentShift] || {};
    
    state.managers = shiftData.managers || [];
    state.teamCaptains = shiftData.teamCaptains || [];
    state.ps = shiftData.ps || [];
    state.contracts = shiftData.contracts || [];
    state.temps = shiftData.temps || [];
    state.packAssignments = shiftData.packAssignments || {};
    state.pickAssignments = shiftData.pickAssignments || {};
    state.packHTP = shiftData.packHTP || {};
    state.pickHTP = shiftData.pickHTP || {};
    state.packNotes = shiftData.packNotes || {};
    state.pickNotes = shiftData.pickNotes || {};
    state.flowData = shiftData.flowData || { managers: [], tcs: [], ps: [], earlyLeave: [] };
    state.snopData = shiftData.snopData || [];
    state.todaySnop = shiftData.todaySnop || 0;
    state.hourlyTarget = shiftData.hourlyTarget || 0;
}

// 모든 테이블 렌더링
function renderAllTables() {
    renderDataTables();
    renderFlowTables();
    renderPackTables();
    renderPickTables();
}

// DATA 테이블 렌더링
function renderDataTables() {
    renderManagerTable();
    renderTCTable();
    renderPSTable();
    renderContractTable();
    renderTempTable();
}

// Manager 테이블
function renderManagerTable() {
    const tbody = document.getElementById('managerTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.managers[i] || { code: '', name: '', nickname: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" data-field="name" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.nickname}" data-field="nickname" data-index="${i}"></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.managers[index]) state.managers[index] = {};
            state.managers[index][field] = e.target.value;
            saveToLocalStorage();
        });
    });
}

// Team Captain 테이블
function renderTCTable() {
    const tbody = document.getElementById('tcTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.teamCaptains[i] || { code: '', name: '', nickname: '', level: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" data-field="name" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.nickname}" data-field="nickname" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.level}" data-field="level" data-index="${i}"></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.teamCaptains[index]) state.teamCaptains[index] = {};
            state.teamCaptains[index][field] = e.target.value;
            saveToLocalStorage();
        });
    });
}

// PS 테이블
function renderPSTable() {
    const tbody = document.getElementById('psTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.ps[i] || { code: '', name: '', team: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" data-field="name" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.team}" data-field="team" data-index="${i}"></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.ps[index]) state.ps[index] = {};
            state.ps[index][field] = e.target.value;
            saveToLocalStorage();
        });
    });
}

// 계약직 테이블
function renderContractTable() {
    const tbody = document.getElementById('contractTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.contracts[i] || {
            code: '', name: '', team: '',
            autobag: false, manual: false, agv: false,
            manualHighSkill: false, autobagHighSkill: false, pickHighSkill: false
        };
        // packHighSkill 마이그레이션
        if (data.packHighSkill !== undefined && data.manualHighSkill === undefined) {
            if (data.packHighSkill && data.manual) data.manualHighSkill = true;
            if (data.packHighSkill && data.autobag) data.autobagHighSkill = true;
            if (data.packHighSkill && !data.manual && !data.autobag) data.manualHighSkill = true;
            delete data.packHighSkill;
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" data-field="name" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.team}" data-field="team" data-index="${i}"></td>
            <td class="skill-toggles-cell">
                <button type="button" class="skill-chip ${data.autobag ? 'active' : ''}" data-field="autobag" data-index="${i}">A</button>
                <button type="button" class="skill-chip ${data.manual ? 'active' : ''}" data-field="manual" data-index="${i}">M</button>
                <button type="button" class="skill-chip ${data.agv ? 'active' : ''}" data-field="agv" data-index="${i}">AGV</button>
            </td>
            <td class="hs-toggles-cell">
                <button type="button" class="hs-chip hs-manual-chip ${data.manualHighSkill ? 'active' : ''}" data-field="manualHighSkill" data-index="${i}" title="메뉴얼 HS">M</button>
                <button type="button" class="hs-chip hs-autobag-chip ${data.autobagHighSkill ? 'active' : ''}" data-field="autobagHighSkill" data-index="${i}" title="오토백 HS">A</button>
            </td>
            <td><button type="button" class="hs-chip hs-pick-chip ${data.pickHighSkill ? 'active' : ''}" data-field="pickHighSkill" data-index="${i}" title="집품 HS">P</button></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.contracts[index]) state.contracts[index] = {};
            state.contracts[index][field] = e.target.value;
            saveToLocalStorage();
        });
    });

    tbody.querySelectorAll('.skill-chip, .hs-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.contracts[index]) state.contracts[index] = {};
            const newVal = !state.contracts[index][field];
            state.contracts[index][field] = newVal;
            e.target.classList.toggle('active', newVal);
            saveToLocalStorage();
        });
    });
}

// 단기직 테이블
function renderTempTable() {
    const tbody = document.getElementById('tempTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.temps[i] || {
            code: '', name: '',
            autobag: false, manual: false, agv: false,
            manualHighSkill: false, autobagHighSkill: false, pickHighSkill: false
        };
        // packHighSkill 마이그레이션
        if (data.packHighSkill !== undefined && data.manualHighSkill === undefined) {
            if (data.packHighSkill && data.manual) data.manualHighSkill = true;
            if (data.packHighSkill && data.autobag) data.autobagHighSkill = true;
            if (data.packHighSkill && !data.manual && !data.autobag) data.manualHighSkill = true;
            delete data.packHighSkill;
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" data-field="name" data-index="${i}"></td>
            <td class="skill-toggles-cell">
                <button type="button" class="skill-chip ${data.autobag ? 'active' : ''}" data-field="autobag" data-index="${i}">A</button>
                <button type="button" class="skill-chip ${data.manual ? 'active' : ''}" data-field="manual" data-index="${i}">M</button>
                <button type="button" class="skill-chip ${data.agv ? 'active' : ''}" data-field="agv" data-index="${i}">AGV</button>
            </td>
            <td class="hs-toggles-cell">
                <button type="button" class="hs-chip hs-manual-chip ${data.manualHighSkill ? 'active' : ''}" data-field="manualHighSkill" data-index="${i}" title="메뉴얼 HS">M</button>
                <button type="button" class="hs-chip hs-autobag-chip ${data.autobagHighSkill ? 'active' : ''}" data-field="autobagHighSkill" data-index="${i}" title="오토백 HS">A</button>
            </td>
            <td><button type="button" class="hs-chip hs-pick-chip ${data.pickHighSkill ? 'active' : ''}" data-field="pickHighSkill" data-index="${i}" title="집품 HS">P</button></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.temps[index]) state.temps[index] = {};
            state.temps[index][field] = e.target.value;
            saveToLocalStorage();
        });
    });

    tbody.querySelectorAll('.skill-chip, .hs-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.temps[index]) state.temps[index] = {};
            const newVal = !state.temps[index][field];
            state.temps[index][field] = newVal;
            e.target.classList.toggle('active', newVal);
            saveToLocalStorage();
        });
    });
}

// FLOW 테이블 렌더링
function renderFlowTables() {
    renderFlowManagerTable();
    renderFlowTCTable();
    renderFlowPSTable();
    renderEarlyLeaveTable();
}

// FLOW Manager 테이블
function renderFlowManagerTable() {
    const tbody = document.getElementById('flowManagerTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.flowData.managers[i] || { code: '', name: '', nickname: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" disabled></td>
            <td><input type="text" class="user-selectable" value="${data.nickname}" disabled></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input:not([disabled])').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const code = e.target.value.trim();
            
            if (!code) {
                state.flowData.managers[index] = { code: '', name: '', nickname: '' };
            } else {
                const manager = state.managers.find(m => m && m.code === code);
                if (!state.flowData.managers[index]) state.flowData.managers[index] = {};
                state.flowData.managers[index].code = code;
                if (manager) {
                    state.flowData.managers[index].name = manager.name;
                    state.flowData.managers[index].nickname = manager.nickname;
                } else {
                    state.flowData.managers[index].name = '';
                    state.flowData.managers[index].nickname = '';
                }
            }
            renderFlowManagerTable();
            saveToLocalStorage();
            updateDashboard();
        });
    });
}

// FLOW TC 테이블
function renderFlowTCTable() {
    const tbody = document.getElementById('flowTcTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.flowData.tcs[i] || { code: '', nickname: '', name: '', level: '', role: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.nickname}" disabled></td>
            <td><input type="text" class="user-selectable" value="${data.name}" disabled></td>
            <td><input type="text" class="user-selectable" value="${data.level}" disabled></td>
            <td><input type="text" class="user-selectable" value="${data.role}" data-field="role" data-index="${i}"></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input[data-field="code"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const code = e.target.value.trim();
            
            if (!code) {
                state.flowData.tcs[index] = { code: '', name: '', nickname: '', level: '', role: '' };
            } else {
                const tc = state.teamCaptains.find(t => t && t.code === code);
                const previousRole = state.flowData.tcs[index]?.role || '';
                if (!state.flowData.tcs[index]) state.flowData.tcs[index] = {};
                state.flowData.tcs[index].code = code;
                state.flowData.tcs[index].role = previousRole;
                if (tc) {
                    state.flowData.tcs[index].name = tc.name;
                    state.flowData.tcs[index].nickname = tc.nickname;
                    state.flowData.tcs[index].level = tc.level;
                } else {
                    state.flowData.tcs[index].name = '';
                    state.flowData.tcs[index].nickname = '';
                    state.flowData.tcs[index].level = '';
                }
            }
            renderFlowTCTable();
            saveToLocalStorage();
            updateDashboard();
        });
    });

    tbody.querySelectorAll('input[data-field="role"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (!state.flowData.tcs[index]) state.flowData.tcs[index] = {};
            state.flowData.tcs[index].role = e.target.value;
            saveToLocalStorage();
        });
    });
}

// FLOW PS 테이블
function renderFlowPSTable() {
    const tbody = document.getElementById('flowPsTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.flowData.ps[i] || { code: '', name: '', team: '', role: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" disabled></td>
            <td><input type="text" class="user-selectable" value="${data.team}" disabled></td>
            <td><input type="text" class="user-selectable" value="${data.role}" data-field="role" data-index="${i}"></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input[data-field="code"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const code = e.target.value.trim();
            
            if (!code) {
                state.flowData.ps[index] = { code: '', name: '', team: '', role: '' };
            } else {
                const ps = state.ps.find(p => p && p.code === code);
                const previousRole = state.flowData.ps[index]?.role || '';
                if (!state.flowData.ps[index]) state.flowData.ps[index] = {};
                state.flowData.ps[index].code = code;
                state.flowData.ps[index].role = previousRole;
                if (ps) {
                    state.flowData.ps[index].name = ps.name;
                    state.flowData.ps[index].team = ps.team;
                } else {
                    state.flowData.ps[index].name = '';
                    state.flowData.ps[index].team = '';
                }
            }
            renderFlowPSTable();
            saveToLocalStorage();
        });
    });

    tbody.querySelectorAll('input[data-field="role"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (!state.flowData.ps[index]) state.flowData.ps[index] = {};
            state.flowData.ps[index].role = e.target.value;
            saveToLocalStorage();
        });
    });
}

// 조퇴 테이블
function renderEarlyLeaveTable() {
    const tbody = document.getElementById('earlyLeaveTable');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const data = state.flowData.earlyLeave[i] || { code: '', name: '', status: '', note: '' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="user-selectable" value="${data.code}" data-field="code" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.name}" data-field="name" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.status}" data-field="status" data-index="${i}"></td>
            <td><input type="text" class="user-selectable" value="${data.note}" data-field="note" data-index="${i}"></td>
        `;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!state.flowData.earlyLeave[index]) state.flowData.earlyLeave[index] = {};
            state.flowData.earlyLeave[index][field] = e.target.value;
            saveToLocalStorage();
        });
    });
}

// PACK 테이블 렌더링 (이벤트 위임 + DocumentFragment 최적화)
function renderPackTables() {
    const zones = ['autobag-1.2', 'autobag-2.5', 'autobag-4.0', 'autobag-rtpb', 'autobag-multi',
                   'manualpack', 'manualpack-multi', 'ace', 'ws'];

    const allDuplicates = findAllDuplicates();

    zones.forEach(zone => {
        const section = document.querySelector(`.pack-section[data-zone="${zone}"]`);
        if (!section) return;
        const tbody = section.querySelector('tbody');
        if (!tbody) return;
        const counterEl = section.querySelector('.zone-counter');
        tbody.innerHTML = '';

        const assignments = state.packAssignments[zone] || [];
        let activeCount = 0;
        const filledCount = assignments.filter(a => a && a.trim()).length;
        const rowCount = Math.max(15, filledCount + 8);
        const noteData = state.packNotes ? (state.packNotes[zone] || []) : [];
        const frag = document.createDocumentFragment();

        for (let i = 0; i < rowCount; i++) {
            const code = assignments[i] || '';
            const person = findPersonByCode(code);
            const note = noteData[i] || '';
            const tr = document.createElement('tr');
            const isDuplicate = code && allDuplicates.has(code);
            if (isDuplicate) tr.classList.add('duplicate-row');
            if (code) { tr.dataset.code = code; activeCount++; }

            let nameCell = '';
            if (person?.name) {
                const isCrown = (person.type === 'tc' || person.type === 'manager');
                const crownPrefix = isCrown ? '👑 ' : '';
                if (isDuplicate) {
                    nameCell = `<span class="duplicate-badge">${crownPrefix}${person.name} ⚠️</span>`;
                } else if (person.manualHighSkill) {
                    nameCell = `<span class="highskill-border highskill-manual-hs">${crownPrefix}${person.name}<span class="hs-badge-label hs-badge-manual">M·HS</span></span>`;
                } else if (person.autobagHighSkill) {
                    nameCell = `<span class="highskill-border highskill-autobag-hs">${crownPrefix}${person.name}<span class="hs-badge-label hs-badge-autobag">A·HS</span></span>`;
                } else if (isCrown) {
                    nameCell = `<span class="crown-name">${crownPrefix}${person.name}</span>`;
                } else {
                    nameCell = `<span class="status-cell">${person.name}</span>`;
                }
            }

            const noteCell = code ?
                `<input type="text" class="note-input" value="${note}" placeholder="" data-zone="${zone}" data-index="${i}">` : '';

            let duplicateInfo = '';
            if (isDuplicate) {
                const locations = allDuplicates.get(code)
                    .filter(d => !(d.type === 'pack' && d.zone === zone))
                    .map(d => `${d.type === 'pack' ? 'P' : 'K'}-${d.zoneName}`)
                    .join(', ');
                if (locations) duplicateInfo = `<div class="duplicate-info" title="중복: ${locations}">📍 ${locations}</div>`;
            }

            tr.innerHTML = `
                <td><input type="text" class="code-input user-selectable ${isDuplicate ? 'duplicate-input' : ''}" value="${code}" data-zone="${zone}" data-index="${i}" placeholder="쿠코드"></td>
                <td class="name-cell user-selectable">${nameCell}${duplicateInfo}</td>
                <td class="type-cell user-selectable">${person ? getStatusText(person) : ''}</td>
                <td class="skill-cell user-selectable">${person ? getSkillBadges(person) : ''}</td>
                <td class="note-cell user-selectable">${noteCell}</td>
            `;
            frag.appendChild(tr);
            if (code) setupRowDragEvents(tr, code, zone, 'pack');
        }

        tbody.appendChild(frag);
        if (counterEl) counterEl.textContent = `${activeCount}명`;

        // 이벤트 위임: zone 단위
        if (!section._packDelegated) {
            section._packDelegated = true;
            section.addEventListener('input', (e) => {
                if (e.target.classList.contains('code-input')) {
                    const z = e.target.dataset.zone;
                    const idx = parseInt(e.target.dataset.index);
                    if (!state.packAssignments[z]) state.packAssignments[z] = [];
                    state.packAssignments[z][idx] = e.target.value.trim();
                    saveToLocalStorage();
                } else if (e.target.classList.contains('note-input')) {
                    const z = e.target.dataset.zone;
                    const idx = parseInt(e.target.dataset.index);
                    if (!state.packNotes) state.packNotes = {};
                    if (!state.packNotes[z]) state.packNotes[z] = [];
                    state.packNotes[z][idx] = e.target.value;
                    saveToLocalStorage();
                }
            });
            section.addEventListener('keydown', (e) => {
                if (e.target.classList.contains('code-input') && e.key === 'Enter') e.target.blur();
            });
            section.addEventListener('focusout', (e) => {
                if (e.target.classList.contains('code-input')) {
                    const z = e.target.dataset.zone;
                    const code = e.target.value.trim();
                    if (code) {
                        const duplicates = findDuplicateAssignment(code, z, 'pack');
                        if (duplicates && duplicates.length > 0) {
                            const person = findPersonByCode(code);
                            const name = person?.name || code;
                            const locs = duplicates.map(d => `${d.type === 'pack' ? 'PACK' : 'PICK'} - ${d.zoneName}`).join(', ');
                            showNotification(`⚠️ 중복 배치: ${name}님이 이미 [${locs}]에 배치되어 있습니다!`, 'warning');
                        }
                    }
                    clearTimeout(packRenderTimeout);
                    packRenderTimeout = setTimeout(() => {
                        if (!isAutocompletePending) { renderPackTables(); updateDashboard(); }
                    }, 200);
                }
            });
        }
    });
}

// PICK 테이블 렌더링 (이벤트 위임 + DocumentFragment 최적화)
function renderPickTables() {
    const zones = ['6.1f', '6.3f', '7.1f', '7.2f', '7.3f', '8f', 'agv', 'ws'];
    const allDuplicates = findAllDuplicates();

    zones.forEach(zone => {
        const section = document.querySelector(`.pick-section[data-zone="${zone}"]`);
        if (!section) return;
        const tbody = section.querySelector('tbody');
        if (!tbody) return;
        const counterEl = section.querySelector('.zone-counter');
        tbody.innerHTML = '';

        const assignments = state.pickAssignments[zone] || [];
        const noteData = state.pickNotes ? (state.pickNotes[zone] || []) : [];
        let activeCount = 0;
        const filledCount = assignments.filter(a => a && a.trim()).length;
        const rowCount = Math.max(15, filledCount + 8);
        const frag = document.createDocumentFragment();

        for (let i = 0; i < rowCount; i++) {
            const code = assignments[i] || '';
            const person = findPersonByCode(code);
            const note = noteData[i] || '';
            const tr = document.createElement('tr');
            const isDuplicate = code && allDuplicates.has(code);
            if (isDuplicate) tr.classList.add('duplicate-row');
            if (code) { tr.dataset.code = code; activeCount++; }

            let nameCell = '';
            if (person?.name) {
                const isCrown = (person.type === 'tc' || person.type === 'manager');
                const crownPrefix = isCrown ? '👑 ' : '';
                if (isDuplicate) {
                    nameCell = `<span class="duplicate-badge">${crownPrefix}${person.name} ⚠️</span>`;
                } else if (person.pickHighSkill) {
                    nameCell = `<span class="highskill-border highskill-pick">${crownPrefix}${person.name}<span class="hs-badge-label hs-badge-pick">P·HS</span></span>`;
                } else if (isCrown) {
                    nameCell = `<span class="crown-name">${crownPrefix}${person.name}</span>`;
                } else {
                    nameCell = `<span class="status-cell">${person.name}</span>`;
                }
            }

            const noteCell = code ?
                `<input type="text" class="note-input" value="${note}" placeholder="" data-zone="${zone}" data-index="${i}">` : '';

            let duplicateInfo = '';
            if (isDuplicate) {
                const locations = allDuplicates.get(code)
                    .filter(d => !(d.type === 'pick' && d.zone === zone))
                    .map(d => `${d.type === 'pack' ? 'P' : 'K'}-${d.zoneName}`)
                    .join(', ');
                if (locations) duplicateInfo = `<div class="duplicate-info" title="중복: ${locations}">📍 ${locations}</div>`;
            }

            tr.innerHTML = `
                <td><input type="text" class="code-input user-selectable ${isDuplicate ? 'duplicate-input' : ''}" value="${code}" data-zone="${zone}" data-index="${i}" placeholder="쿠코드"></td>
                <td class="name-cell user-selectable">${nameCell}${duplicateInfo}</td>
                <td class="type-cell user-selectable">${person ? getStatusText(person) : ''}</td>
                <td class="skill-cell user-selectable">${person ? getSkillBadges(person) : ''}</td>
                <td class="note-cell user-selectable">${noteCell}</td>
            `;
            frag.appendChild(tr);
            if (code) setupRowDragEvents(tr, code, zone, 'pick');
        }

        tbody.appendChild(frag);
        if (counterEl) counterEl.textContent = `${activeCount}명`;

        // 이벤트 위임: zone 단위
        if (!section._pickDelegated) {
            section._pickDelegated = true;
            section.addEventListener('input', (e) => {
                if (e.target.classList.contains('code-input')) {
                    const z = e.target.dataset.zone;
                    const idx = parseInt(e.target.dataset.index);
                    if (!state.pickAssignments[z]) state.pickAssignments[z] = [];
                    state.pickAssignments[z][idx] = e.target.value.trim();
                    saveToLocalStorage();
                } else if (e.target.classList.contains('note-input')) {
                    const z = e.target.dataset.zone;
                    const idx = parseInt(e.target.dataset.index);
                    if (!state.pickNotes) state.pickNotes = {};
                    if (!state.pickNotes[z]) state.pickNotes[z] = [];
                    state.pickNotes[z][idx] = e.target.value;
                    saveToLocalStorage();
                }
            });
            section.addEventListener('keydown', (e) => {
                if (e.target.classList.contains('code-input') && e.key === 'Enter') e.target.blur();
            });
            section.addEventListener('focusout', (e) => {
                if (e.target.classList.contains('code-input')) {
                    const z = e.target.dataset.zone;
                    const code = e.target.value.trim();
                    if (code) {
                        const duplicates = findDuplicateAssignment(code, z, 'pick');
                        if (duplicates && duplicates.length > 0) {
                            const person = findPersonByCode(code);
                            const name = person?.name || code;
                            const locs = duplicates.map(d => `${d.type === 'pack' ? 'PACK' : 'PICK'} - ${d.zoneName}`).join(', ');
                            showNotification(`⚠️ 중복 배치: ${name}님이 이미 [${locs}]에 배치되어 있습니다!`, 'warning');
                        }
                    }
                    clearTimeout(pickRenderTimeout);
                    pickRenderTimeout = setTimeout(() => {
                        if (!isAutocompletePending) { renderPickTables(); updateDashboard(); }
                    }, 200);
                }
            });
        }
    });
}

// 쿠코드로 인원 찾기 (TC, 매니저 포함)
function findPersonByCode(code) {
    if (!code) return null;

    const contract = state.contracts.find(c => c && c.code === code);
    if (contract) return { ...contract, type: 'contract' };

    const temp = state.temps.find(t => t && t.code === code);
    if (temp) return { ...temp, type: 'temp' };

    const tc = state.teamCaptains.find(t => t && t.code === code);
    if (tc) return { ...tc, type: 'tc' };

    const manager = state.managers.find(m => m && m.code === code);
    if (manager) return { ...manager, type: 'manager' };

    const ps = state.ps.find(p => p && p.code === code);
    if (ps) return { ...ps, type: 'ps' };

    return null;
}

// 중복 배치 감지
function findDuplicateAssignment(code, excludeZone = null, excludeType = null) {
    if (!code) return null;

    const duplicates = [];

    // PACK 구역 검사
    Object.keys(state.packAssignments).forEach(zone => {
        const assignments = state.packAssignments[zone] || [];
        assignments.forEach((assignedCode, index) => {
            if (assignedCode === code) {
                if (!(excludeType === 'pack' && excludeZone === zone)) {
                    duplicates.push({
                        type: 'pack',
                        zone: zone,
                        index: index,
                        zoneName: getZoneName(zone, 'pack')
                    });
                }
            }
        });
    });

    // PICK 구역 검사
    Object.keys(state.pickAssignments).forEach(zone => {
        const assignments = state.pickAssignments[zone] || [];
        assignments.forEach((assignedCode, index) => {
            if (assignedCode === code) {
                if (!(excludeType === 'pick' && excludeZone === zone)) {
                    duplicates.push({
                        type: 'pick',
                        zone: zone,
                        index: index,
                        zoneName: getZoneName(zone, 'pick')
                    });
                }
            }
        });
    });

    return duplicates.length > 0 ? duplicates : null;
}

// 구역 이름 가져오기
function getZoneName(zone, type) {
    const packZoneNames = {
        'autobag-1.2': 'Autobag 1.2',
        'autobag-2.5': 'Autobag 2.5',
        'autobag-4.0': 'Autobag 4.0',
        'autobag-rtpb': 'Autobag RTPB',
        'autobag-multi': 'Autobag 멀티',
        'manualpack': 'ManualPack',
        'manualpack-multi': 'ManualPack Multi',
        'ace': 'ACE',
        'ws': 'WS (워터)'
    };

    const pickZoneNames = {
        '6.1f': '6.1F',
        '6.3f': '6.3F',
        '7.1f': '7.1F',
        '7.2f': '7.2F',
        '7.3f': '7.3F',
        '8f': '8F',
        'agv': 'AGV',
        'ws': 'WS (워터)'
    };

    if (type === 'pack') {
        return packZoneNames[zone] || zone;
    } else {
        return pickZoneNames[zone] || zone;
    }
}

// 모든 중복 배치 찾기
function findAllDuplicates() {
    const allCodes = new Map(); // code -> [{type, zone, index}]

    // PACK 구역 수집
    Object.keys(state.packAssignments).forEach(zone => {
        const assignments = state.packAssignments[zone] || [];
        assignments.forEach((code, index) => {
            if (code) {
                if (!allCodes.has(code)) {
                    allCodes.set(code, []);
                }
                allCodes.get(code).push({
                    type: 'pack',
                    zone: zone,
                    index: index,
                    zoneName: getZoneName(zone, 'pack')
                });
            }
        });
    });

    // PICK 구역 수집
    Object.keys(state.pickAssignments).forEach(zone => {
        const assignments = state.pickAssignments[zone] || [];
        assignments.forEach((code, index) => {
            if (code) {
                if (!allCodes.has(code)) {
                    allCodes.set(code, []);
                }
                allCodes.get(code).push({
                    type: 'pick',
                    zone: zone,
                    index: index,
                    zoneName: getZoneName(zone, 'pick')
                });
            }
        });
    });

    // 중복된 것만 필터링
    const duplicates = new Map();
    allCodes.forEach((locations, code) => {
        if (locations.length > 1) {
            duplicates.set(code, locations);
        }
    });

    return duplicates;
}

// 상태 텍스트
function getStatusText(person) {
    if (person.type === 'tc') {
        return '<span class="type-badge type-tc">T/C</span>';
    } else if (person.type === 'manager') {
        return '<span class="type-badge type-mgr">M/G</span>';
    } else if (person.type === 'ps') {
        return '<span class="type-badge type-ps">PS</span>';
    } else if (person.type === 'contract' && person.team) {
        return `<span class="type-badge type-contract">${person.team.toUpperCase()}조</span>`;
    } else if (person.type === 'contract') {
        return '<span class="type-badge type-contract">계약</span>';
    } else if (person.type === 'temp') {
        return '<span class="type-badge type-temp">단기</span>';
    }
    return '';
}

// 숙련도 뱃지
function getSkillBadges(person) {
    const badges = [];
    if (person.autobag) badges.push('<span class="skill-badge autobag">A</span>');
    if (person.manual) badges.push('<span class="skill-badge manual">M</span>');
    if (person.agv) badges.push('<span class="skill-badge agv">AGV</span>');
    return badges.join('');
}

// 대시보드 업데이트
function updateDashboard() {
    let packCount = 0;
    let pickCount = 0;
    let wsCount = 0;

    Object.keys(state.packAssignments).forEach(zone => {
        const assignments = state.packAssignments[zone] || [];
        if (zone === 'ws') {
            wsCount += assignments.filter(code => code).length;
        } else {
            packCount += assignments.filter(code => code).length;
        }
    });

    Object.keys(state.pickAssignments).forEach(zone => {
        const assignments = state.pickAssignments[zone] || [];
        if (zone === 'ws') {
            wsCount += assignments.filter(code => code).length;
        } else {
            pickCount += assignments.filter(code => code).length;
        }
    });

    const tcCount = state.flowData.tcs.filter(tc => tc && tc.code).length;
    const managerCount = state.flowData.managers.filter(m => m && m.code).length;
    const totalCount = packCount + pickCount + tcCount + managerCount;

    document.getElementById('packCount').textContent = packCount;
    document.getElementById('pickCount').textContent = pickCount;
    document.getElementById('wsCount').textContent = wsCount;
    document.getElementById('tcCount').textContent = tcCount;
    document.getElementById('managerCount').textContent = managerCount;
    document.getElementById('totalCount').textContent = totalCount;

    updateSkillDistribution();
    updateHighskillDistribution();
    updateWorkerTypeDistribution();
    updateZoneDetails();

    // 계약직 배치 안내판 업데이트
    renderContractBoard();
}

// 숙련도별 분포 업데이트
function updateSkillDistribution() {
    // PACK + PICK에 배치된 모든 쿠코드 수집
    const assignedCodes = new Set();
    
    Object.values(state.packAssignments).forEach(assignments => {
        assignments.forEach(code => {
            if (code) assignedCodes.add(code);
        });
    });
    
    Object.values(state.pickAssignments).forEach(assignments => {
        assignments.forEach(code => {
            if (code) assignedCodes.add(code);
        });
    });
    
    // 배치된 인원만 필터링
    let autobagCount = 0;
    let manualCount = 0;
    let agvCount = 0;
    
    assignedCodes.forEach(code => {
        const person = findPersonByCode(code);
        if (person) {
            if (person.autobag) autobagCount++;
            if (person.manual) manualCount++;
            if (person.agv) agvCount++;
        }
    });
    
    document.getElementById('autobagCount').textContent = autobagCount;
    document.getElementById('manualCount').textContent = manualCount;
    document.getElementById('agvCount').textContent = agvCount;
}

// 하이스킬 분포 업데이트 (팩HS → 메뉴얼HS + 오토백HS 분리)
function updateHighskillDistribution() {
    const assignedCodes = new Set();

    Object.values(state.packAssignments).forEach(assignments => {
        assignments.forEach(code => {
            if (code) assignedCodes.add(code);
        });
    });

    Object.values(state.pickAssignments).forEach(assignments => {
        assignments.forEach(code => {
            if (code) assignedCodes.add(code);
        });
    });

    let manualHsCount = 0;
    let autobagHsCount = 0;
    let pickHighskillCount = 0;

    assignedCodes.forEach(code => {
        const person = findPersonByCode(code);
        if (person) {
            if (person.manualHighSkill) manualHsCount++;
            if (person.autobagHighSkill) autobagHsCount++;
            if (person.pickHighSkill) pickHighskillCount++;
        }
    });

    const manualHsEl = document.getElementById('manualHsCount');
    const autobagHsEl = document.getElementById('autobagHsCount');
    const pickHsEl = document.getElementById('pickHighskillCount');

    if (manualHsEl) manualHsEl.textContent = manualHsCount;
    if (autobagHsEl) autobagHsEl.textContent = autobagHsCount;
    if (pickHsEl) pickHsEl.textContent = pickHighskillCount;
}

// 인원 유형 분포 업데이트
function updateWorkerTypeDistribution() {
    // PACK + PICK에 배치된 모든 쿠코드 수집
    const assignedCodes = new Set();
    
    Object.values(state.packAssignments).forEach(assignments => {
        assignments.forEach(code => {
            if (code) assignedCodes.add(code);
        });
    });
    
    Object.values(state.pickAssignments).forEach(assignments => {
        assignments.forEach(code => {
            if (code) assignedCodes.add(code);
        });
    });
    
    // 배치된 인원만 필터링
    let contractCount = 0;
    let tempCount = 0;
    
    assignedCodes.forEach(code => {
        const person = findPersonByCode(code);
        if (person) {
            if (person.type === 'contract') {
                contractCount++;
            } else if (person.type === 'temp') {
                tempCount++;
            }
        }
    });
    
    const total = contractCount + tempCount;
    const contractPercentage = total > 0 ? Math.round((contractCount / total) * 100) : 0;
    const tempPercentage = total > 0 ? Math.round((tempCount / total) * 100) : 0;
    
    const contractBar = document.getElementById('contractBar');
    const tempBar = document.getElementById('tempBar');
    
    if (contractBar) {
        contractBar.style.width = contractPercentage + '%';
        contractBar.dataset.percentage = contractPercentage;
    }
    
    if (tempBar) {
        tempBar.style.width = tempPercentage + '%';
        tempBar.dataset.percentage = tempPercentage;
    }
    
    const contractCountEl = document.getElementById('contractCount');
    const tempCountEl = document.getElementById('tempCount');
    if (contractCountEl) contractCountEl.textContent = `${contractCount}명 (${contractPercentage}%)`;
    if (tempCountEl) tempCountEl.textContent = `${tempCount}명 (${tempPercentage}%)`;
}

// 구역별 상세 현황 업데이트
function updateZoneDetails() {
    updatePackZones();
    updatePickZones();
}

function updatePackZones() {
    const packZones = {
        'autobag-1.2': 'Autobag 1.2',
        'autobag-2.5': 'Autobag 2.5',
        'autobag-4.0': 'Autobag 4.0',
        'autobag-rtpb': 'Autobag RTPB',
        'autobag-multi': 'Autobag 멀티',
        'manualpack': 'ManualPack',
        'manualpack-multi': 'ManualPack Multi',
        'ace': 'ACE',
        'ws': 'WS (워터)'
    };
    
    const packZoneList = document.getElementById('packZoneList');
    if (!packZoneList) return;
    
    packZoneList.innerHTML = '';
    
    Object.keys(packZones).forEach(zone => {
        const assignments = state.packAssignments[zone] || [];
        const count = assignments.filter(code => code).length;
        const maxCount = 30;
        const percentage = (count / maxCount) * 100;
        
        const zoneItem = document.createElement('div');
        zoneItem.className = `zone-item ${count === 0 ? 'empty' : ''}`;
        zoneItem.dataset.page = 'pack';
        zoneItem.innerHTML = `
            <div class="zone-item-info">
                <div class="zone-item-name">${packZones[zone]}</div>
                <div class="zone-item-progress">
                    <div class="zone-item-progress-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
            <div class="zone-item-count">${count}명</div>
        `;
        
        zoneItem.addEventListener('click', () => {
            navigateToPage('pack');
        });
        
        packZoneList.appendChild(zoneItem);
    });
}

function updatePickZones() {
    const pickZones = {
        '6.1f': '6.1F',
        '6.3f': '6.3F',
        '7.1f': '7.1F',
        '7.2f': '7.2F',
        '7.3f': '7.3F',
        '8f': '8F',
        'agv': 'AGV',
        'ws': 'WS (워터)'
    };
    
    const pickZoneList = document.getElementById('pickZoneList');
    if (!pickZoneList) return;
    
    pickZoneList.innerHTML = '';
    
    Object.keys(pickZones).forEach(zone => {
        const assignments = state.pickAssignments[zone] || [];
        const count = assignments.filter(code => code).length;
        const maxCount = 30;
        const percentage = (count / maxCount) * 100;
        
        const zoneItem = document.createElement('div');
        zoneItem.className = `zone-item ${count === 0 ? 'empty' : ''}`;
        zoneItem.dataset.page = 'pick';
        zoneItem.innerHTML = `
            <div class="zone-item-info">
                <div class="zone-item-name">${pickZones[zone]}</div>
                <div class="zone-item-progress">
                    <div class="zone-item-progress-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
            <div class="zone-item-count">${count}명</div>
        `;
        
        zoneItem.addEventListener('click', () => {
            navigateToPage('pick');
        });
        
        pickZoneList.appendChild(zoneItem);
    });
}

function navigateToPage(pageId) {
    const menuLinks = document.querySelectorAll('.menu-list a');
    const pages = document.querySelectorAll('.page');
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');

    menuLinks.forEach(link => {
        if (link.dataset.page === pageId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    bottomNavItems.forEach(btn => {
        if (btn.dataset.page === pageId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    pages.forEach(page => {
        if (page.id === pageId) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });

    state.currentPage = pageId;
    sideMenu.classList.remove('active');
    if (menuOverlay) menuOverlay.classList.remove('active');

    // Scroll to top
    window.scrollTo(0, 0);
}

// 자동완성 설정
function setupAutocomplete() {
    const autocompleteDropdown = document.getElementById('autocomplete');
    let currentInput = null;
    let selectedIndex = -1;

    // 스크롤 및 리사이즈 시 자동완성 위치 업데이트
    let scrollTimeout = null;
    const handleScrollOrResize = () => {
        if (currentInput && autocompleteDropdown.classList.contains('active')) {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                updateAutocompletePosition(currentInput);
            }, 10);
        }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    document.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'text' && !e.target.disabled && !e.target.classList.contains('note-input')) {
            currentInput = e.target;
            const value = e.target.value.trim().toLowerCase();

            if (value.length >= 1) {
                const suggestions = getAllPersonSuggestions(value);
                showAutocomplete(e.target, suggestions);
            } else {
                hideAutocomplete();
            }
        }
    });

    // focus 이벤트 추가 - 이미 값이 있을 때 포커스하면 자동완성 표시
    document.addEventListener('focus', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'text' && !e.target.disabled && !e.target.classList.contains('note-input')) {
            currentInput = e.target;
            const value = e.target.value.trim().toLowerCase();

            if (value.length >= 1) {
                const suggestions = getAllPersonSuggestions(value);
                showAutocomplete(e.target, suggestions);
            }
        }
    }, true);

    document.addEventListener('keydown', (e) => {
        if (!autocompleteDropdown.classList.contains('active')) return;

        const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelectedItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
            updateSelectedItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && items[selectedIndex]) {
                items[selectedIndex].click();
            }
        } else if (e.key === 'Escape') {
            hideAutocomplete();
        } else if (e.key === 'Tab') {
            hideAutocomplete();
        }
    });

    document.addEventListener('click', (e) => {
        if (!autocompleteDropdown.contains(e.target) && e.target !== currentInput) {
            hideAutocomplete();
        }
    });

    // blur 이벤트로 포커스 잃을 때 자동완성 숨기기 (자동완성 클릭 중이면 유지)
    document.addEventListener('blur', (e) => {
        if (e.target === currentInput) {
            setTimeout(() => {
                if (!isAutocompletePending &&
                    document.activeElement !== currentInput &&
                    !autocompleteDropdown.contains(document.activeElement)) {
                    hideAutocomplete();
                }
            }, 200);
        }
    }, true);

    function updateSelectedItem(items) {
        items.forEach((item, idx) => {
            if (idx === selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function updateAutocompletePosition(input) {
        if (!input) return;

        const rect = input.getBoundingClientRect();

        // 입력창이 화면에 보이지 않으면 숨기기
        if (rect.width === 0 || rect.height === 0) {
            hideAutocomplete();
            return;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const dropdownWidth = Math.max(rect.width, 280);
        const dropdownRect = autocompleteDropdown.getBoundingClientRect();
        const dropdownHeight = dropdownRect.height || 200;

        let left = rect.left;
        let top = rect.bottom + 4;

        // 오른쪽 경계 체크
        if (left + dropdownWidth > viewportWidth - 10) {
            left = Math.max(10, viewportWidth - dropdownWidth - 10);
        }

        // 왼쪽 경계 체크
        if (left < 10) {
            left = 10;
        }

        // 하단 경계 체크 - 아래 공간이 부족하면 위쪽에 표시
        if (top + dropdownHeight > viewportHeight - 10) {
            const topSpace = rect.top - 10;
            if (topSpace > dropdownHeight) {
                top = rect.top - dropdownHeight - 4;
            } else {
                // 위/아래 모두 공간이 부족하면 가능한 만큼 표시
                top = Math.max(10, viewportHeight - dropdownHeight - 10);
            }
        }

        autocompleteDropdown.style.position = 'fixed';
        autocompleteDropdown.style.left = left + 'px';
        autocompleteDropdown.style.top = top + 'px';
        autocompleteDropdown.style.width = dropdownWidth + 'px';
        autocompleteDropdown.style.zIndex = '99999';
        autocompleteDropdown.style.maxHeight = Math.min(300, viewportHeight - top - 20) + 'px';
    }

    function showAutocomplete(input, suggestions) {
        if (suggestions.length === 0) {
            hideAutocomplete();
            return;
        }

        // 먼저 내용 설정
        autocompleteDropdown.innerHTML = suggestions.map(person => {
            const skills = [];
            if (person.autobag) skills.push('<span>오토백</span>');
            if (person.manual) skills.push('<span>메뉴얼</span>');
            if (person.agv) skills.push('<span>AGV</span>');

            const badges = [];
            if (person.manualHighSkill) badges.push('<span style="color:#84cc16">M·HS</span>');
            if (person.autobagHighSkill) badges.push('<span style="color:#38bdf8">A·HS</span>');
            if (person.pickHighSkill) badges.push('<span style="color:#ef4444">P·HS</span>');

            return `
                <div class="autocomplete-item" data-code="${person.code}">
                    <div class="autocomplete-name">${person.name}</div>
                    <div class="autocomplete-code">${person.code}</div>
                    ${(skills.length > 0 || badges.length > 0) ? `<div class="autocomplete-meta">
                        ${skills.join('')}
                        ${badges.join('')}
                        ${person.team ? `<span>${person.team}조</span>` : ''}
                    </div>` : ''}
                </div>
            `;
        }).join('');

        // 클릭 이벤트 설정 (mousedown 사용으로 blur 전에 처리)
        autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // blur 방지
                e.stopPropagation();
                isAutocompletePending = true;
            });

            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (currentInput) {
                    const code = item.dataset.code;
                    const zone = currentInput.dataset.zone;
                    const index = parseInt(currentInput.dataset.index);

                    currentInput.value = code;

                    // state 직접 업데이트
                    const isPack = currentInput.closest('.pack-section') !== null;
                    const isPick = currentInput.closest('.pick-section') !== null;

                    if (isPack && zone !== undefined) {
                        if (!state.packAssignments[zone]) state.packAssignments[zone] = [];
                        state.packAssignments[zone][index] = code;
                    } else if (isPick && zone !== undefined) {
                        if (!state.pickAssignments[zone]) state.pickAssignments[zone] = [];
                        state.pickAssignments[zone][index] = code;
                    }

                    saveToLocalStorage();
                }

                hideAutocomplete();
                isAutocompletePending = false;

                // 렌더링은 약간 지연 후 실행
                setTimeout(() => {
                    const isPack = currentInput?.closest('.pack-section') !== null;
                    const isPick = currentInput?.closest('.pick-section') !== null;
                    if (isPack) {
                        renderPackTables();
                    } else if (isPick) {
                        renderPickTables();
                    }
                    updateDashboard();
                }, 50);
            });
        });

        // active 클래스 추가
        autocompleteDropdown.classList.add('active');
        selectedIndex = -1;

        // 위치 계산
        requestAnimationFrame(() => {
            updateAutocompletePosition(input);
        });
    }

    function hideAutocomplete() {
        autocompleteDropdown.classList.remove('active');
        autocompleteDropdown.style.display = '';
        selectedIndex = -1;
    }

    function getAllPersonSuggestions(searchTerm) {
        const allPersons = [
            ...state.contracts.filter(c => c && (c.code || c.name)).map(c => ({ ...c, type: 'contract' })),
            ...state.temps.filter(t => t && (t.code || t.name)).map(t => ({ ...t, type: 'temp' })),
            ...state.teamCaptains.filter(tc => tc && (tc.code || tc.name)).map(tc => ({ ...tc, type: 'tc' })),
            ...state.managers.filter(m => m && (m.code || m.name)).map(m => ({ ...m, type: 'manager' })),
            ...state.ps.filter(p => p && (p.code || p.name)).map(p => ({ ...p, type: 'ps' }))
        ];

        return allPersons.filter(person => {
            const code = (person.code || '').toLowerCase();
            const name = (person.name || '').toLowerCase();
            return code.includes(searchTerm) || name.includes(searchTerm);
        }).slice(0, 10);
    }
}

// 실시간 시계
function initializeClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const liveTime = document.getElementById('liveTime');
    const liveDate = document.getElementById('liveDate');
    const miniClock = document.getElementById('miniClockTime');

    if (liveTime) liveTime.textContent = timeStr;
    if (liveDate) liveDate.textContent = dateStr;
    if (miniClock) miniClock.textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// SNOP 저장
function setupSnopSave() {
    const saveBtn = document.getElementById('saveSnopBtn');
    const snopInput = document.getElementById('todaySnop');
    const targetInput = document.getElementById('hourlyTarget');
    
    saveBtn.addEventListener('click', () => {
        const snop = parseInt(snopInput.value) || 0;
        const target = parseInt(targetInput.value) || 0;
        
        if (snop > 0 && target > 0) {
            saveTodaySnop(snop, target);
            alert('✅ SNOP 데이터가 저장되었습니다!');
        } else {
            alert('⚠️ SNOP과 시간당 처리량을 입력해주세요.');
        }
    });
}

function saveTodaySnop(snop, target) {
    const today = new Date().toISOString().split('T')[0];
    const existingIndex = state.snopData.findIndex(d => d.date === today);
    
    if (existingIndex >= 0) {
        state.snopData[existingIndex] = { date: today, snop, target };
    } else {
        state.snopData.push({ date: today, snop, target });
    }
    
    state.snopData = state.snopData.slice(-7);
    state.todaySnop = snop;
    state.hourlyTarget = target;
    
    saveToLocalStorage();
    updateChart();
}

function loadSnopData() {
    const snopInput = document.getElementById('todaySnop');
    const targetInput = document.getElementById('hourlyTarget');
    
    snopInput.value = state.todaySnop || '';
    targetInput.value = state.hourlyTarget || '';
}

// 차트 초기화
function initializeChart() {
    const ctx = document.getElementById('snopChart');
    if (!ctx) return;
    
    const dates = getLast7Days();
    const snopValues = dates.map(date => {
        const data = state.snopData.find(d => d.date === date);
        return data ? data.snop : 0;
    });
    const targetValues = dates.map(date => {
        const data = state.snopData.find(d => d.date === date);
        return data ? data.target * 10 : 0;
    });
    
    const labels = dates.map(date => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    
    snopChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'SNOP',
                    data: snopValues,
                    borderColor: 'rgba(102, 126, 234, 1)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: '목표 (시간당 × 10)',
                    data: targetValues,
                    borderColor: 'rgba(245, 87, 108, 1)',
                    backgroundColor: 'rgba(245, 87, 108, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: 'rgba(245, 87, 108, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    cornerRadius: 8,
                    displayColors: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function updateChart() {
    if (!snopChart) return;
    
    const dates = getLast7Days();
    const snopValues = dates.map(date => {
        const data = state.snopData.find(d => d.date === date);
        return data ? data.snop : 0;
    });
    const targetValues = dates.map(date => {
        const data = state.snopData.find(d => d.date === date);
        return data ? data.target * 10 : 0;
    });
    
    snopChart.data.datasets[0].data = snopValues;
    snopChart.data.datasets[1].data = targetValues;
    snopChart.update('active');
}

function getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push(date.toISOString().split('T')[0]);
    }
    return days;
}

// 검색 기능
function setupSearch() {
    const packSearch = document.getElementById('packSearch');
    const pickSearch = document.getElementById('pickSearch');
    
    if (packSearch) {
        packSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterTable(query, '.pack-section');
        });
    }
    
    if (pickSearch) {
        pickSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterTable(query, '.pick-section');
        });
    }
}

function filterTable(query, selectorPrefix) {
    const sections = document.querySelectorAll(selectorPrefix);
    
    sections.forEach(section => {
        const rows = section.querySelectorAll('tbody tr');
        let hasVisibleRows = false;
        
        rows.forEach(row => {
            const code = row.querySelector('input[type="text"]')?.value.toLowerCase() || '';
            const cells = Array.from(row.querySelectorAll('td'));
            const textContent = cells.map(cell => cell.textContent.toLowerCase()).join(' ');
            
            if (!query || code.includes(query) || textContent.includes(query)) {
                row.style.display = '';
                if (code) hasVisibleRows = true;
            } else {
                row.style.display = 'none';
            }
        });
        
        section.style.opacity = hasVisibleRows || !query ? '1' : '0.5';
    });
}

// Excel 형식 복사/붙여넣기
function setupCopyPaste() {
    // 선택 시각화
    let isSelecting = false;
    
    document.addEventListener('mousedown', (e) => {
        const row = e.target.closest('.work-table tbody tr');
        if (row) {
            isSelecting = true;
        }
    });
    
    document.addEventListener('mouseup', () => {
        isSelecting = false;
    });
    
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        const rows = document.querySelectorAll('.work-table tbody tr');
        
        rows.forEach(row => {
            row.classList.remove('selecting');
        });
        
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            rows.forEach(row => {
                try {
                    if (selection.containsNode && selection.containsNode(row, true)) {
                        row.classList.add('selecting');
                    }
                } catch (e) {
                    // 일부 브라우저 호환성 문제 무시
                }
            });
        }
    });
    
    document.addEventListener('copy', (e) => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (!selectedText) return;
        
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (!range) return;
        
        const container = range.commonAncestorContainer;
        const table = container.nodeType === 1 ? 
            container.closest('.work-table, .data-table') : 
            container.parentElement?.closest('.work-table, .data-table');
        
        if (!table) return;
        
        const selectedRows = getSelectedRows(table, selection);
        if (selectedRows.length === 0) return;
        
        const excelData = [];
        
        selectedRows.forEach(row => {
            const codeInput = row.querySelector('td:nth-child(1) input');
            const code = codeInput?.value?.trim() || '';
            
            if (!code) return;
            
            const person = findPersonByCode(code);
            if (!person) return;
            
            const name = person.name || '';
            const status = person.type === 'contract' ? 
                `계약직 - ${person.team}조` : '단기직';
            
            excelData.push(`${code}\t${name}\t${status}`);
        });
        
        if (excelData.length > 0) {
            e.clipboardData.setData('text/plain', excelData.join('\n'));
            e.preventDefault();
            
            showNotification(`✅ ${excelData.length}개 행 복사되었습니다!`, 'success');
            
            // 선택 효과 제거
            setTimeout(() => {
                document.querySelectorAll('.work-table tbody tr.selecting').forEach(row => {
                    row.classList.remove('selecting');
                });
            }, 1000);
        }
    });
    
    document.addEventListener('paste', async (e) => {
        const pasteData = e.clipboardData.getData('text/plain');
        if (!pasteData) return;
        
        const activeElement = document.activeElement;
        const tbody = activeElement?.closest('tbody');
        if (!tbody) return;
        
        const zone = tbody.closest('[data-zone]')?.dataset.zone;
        const isPack = tbody.closest('.pack-section') !== null;
        const isPick = tbody.closest('.pick-section') !== null;
        
        if (!zone || (!isPack && !isPick)) return;
        
        e.preventDefault();
        
        const lines = pasteData.trim().split('\n');
        const assignments = isPack ? state.packAssignments : state.pickAssignments;
        
        if (!assignments[zone]) assignments[zone] = [];
        
        const startIndex = getFirstEmptyIndex(assignments[zone]);
        
        let pastedCount = 0;
        lines.forEach((line, i) => {
            const parts = line.split('\t');
            const code = parts[0]?.trim();
            if (code && /^[A-Z]\d{7}$/.test(code)) {
                assignments[zone][startIndex + i] = code;
                pastedCount++;
            }
        });
        
        if (pastedCount > 0) {
            if (isPack) {
                renderPackTables();
            } else {
                renderPickTables();
            }
            saveToLocalStorage();
            updateDashboard();
            
            showNotification(`✅ ${pastedCount}명 추가되었습니다!`, 'success');
        }
    });
}

function showNotification(message, type = 'info') {
    const existingNotif = document.querySelector('.notification-toast');
    if (existingNotif) {
        existingNotif.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);

    // 활동 피드에도 기록
    if (typeof addActivity === 'function') {
        // 이모지 제거한 클린 메시지
        const cleanMessage = message.replace(/[\u{1F300}-\u{1FBFF}\u2600-\u2B55\u{FE00}-\u{FE0F}]/gu, '').trim();
        addActivity(cleanMessage, type);
    }
}

function getSelectedRows(table, selection) {
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const selectedRows = [];
    
    rows.forEach(row => {
        try {
            if (selection.containsNode(row, true)) {
                const code = row.querySelector('input[type="text"]')?.value;
                if (code && code.trim()) {
                    selectedRows.push(row);
                }
            }
        } catch (e) {
            // 일부 브라우저에서 containsNode가 지원되지 않을 수 있음
        }
    });
    
    return selectedRows;
}

function getFirstEmptyIndex(assignments) {
    for (let i = 0; i < 30; i++) {
        if (!assignments[i]) return i;
    }
    return 0;
}

// ==================== Firebase 실시간 연동 ====================

// 배치 안내판 UI 설정
function setupFirebaseUI() {
    // 초기 렌더링
    renderContractBoard();

    // 이미지 복사 버튼 설정
    setupCopyImageButton();

    // 날짜 표시
    updateBoardDate();
}

// 날짜 표시 업데이트
function updateBoardDate() {
    const dateEl = document.getElementById('boardDate');
    if (dateEl) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short'
        });
        const shiftStr = state.currentShift === 'DAY' ? '주간' : '야간';
        dateEl.textContent = `${dateStr} ${shiftStr}`;
    }
}

// 이미지 복사 버튼 설정
function setupCopyImageButton() {
    const copyBtn = document.getElementById('copyImageBtn');
    if (!copyBtn) return;

    copyBtn.addEventListener('click', async () => {
        await copyBoardAsImage();
    });
}

// 배치판을 이미지로 복사
async function copyBoardAsImage() {
    const captureEl = document.getElementById('contractBoardCapture');
    const copyBtn = document.getElementById('copyImageBtn');

    if (!captureEl || typeof html2canvas === 'undefined') {
        showNotification('❌ 이미지 복사 기능을 사용할 수 없습니다.', 'error');
        return;
    }

    try {
        // 버튼 상태 변경
        copyBtn.classList.add('copying');
        copyBtn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> 복사 중...';

        // 날짜 업데이트
        updateBoardDate();

        // html2canvas로 캡처
        const canvas = await html2canvas(captureEl, {
            backgroundColor: '#f8fafc',
            scale: 2, // 고해상도
            useCORS: true,
            logging: false,
            windowWidth: captureEl.scrollWidth,
            windowHeight: captureEl.scrollHeight
        });

        // 캔버스를 Blob으로 변환
        canvas.toBlob(async (blob) => {
            try {
                // 클립보드에 복사
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'image/png': blob
                    })
                ]);

                // 성공 표시
                copyBtn.classList.remove('copying');
                copyBtn.classList.add('success');
                copyBtn.innerHTML = '<span class="material-icons-round">check</span> 복사 완료!';
                showNotification('📷 이미지가 클립보드에 복사되었습니다!', 'success');

                // 3초 후 버튼 원래대로
                setTimeout(() => {
                    copyBtn.classList.remove('success');
                    copyBtn.innerHTML = '<span class="material-icons-round">photo_camera</span> 이미지 복사';
                }, 3000);

            } catch (clipboardError) {
                // 클립보드 API 지원 안되면 다운로드로 대체
                console.error('클립보드 복사 실패:', clipboardError);
                downloadImage(canvas);

                copyBtn.classList.remove('copying');
                copyBtn.innerHTML = '<span class="material-icons-round">photo_camera</span> 이미지 복사';
            }
        }, 'image/png');

    } catch (error) {
        console.error('이미지 캡처 실패:', error);
        copyBtn.classList.remove('copying');
        copyBtn.innerHTML = '<span class="material-icons-round">photo_camera</span> 이미지 복사';
        showNotification('❌ 이미지 캡처 실패: ' + error.message, 'error');
    }
}

// 이미지 다운로드 (클립보드 복사 실패 시 대체)
function downloadImage(canvas) {
    const link = document.createElement('a');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const shiftStr = state.currentShift === 'DAY' ? 'day' : 'swing';

    link.download = `배치현황_${dateStr}_${shiftStr}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    showNotification('📥 이미지가 다운로드되었습니다.', 'info');
}

// 계약직 배치 안내판 렌더링
function renderContractBoard() {
    const container = document.getElementById('contractBoardContent');
    if (!container) return;

    // 계약직 쿠코드 목록 (null 체크 포함)
    const contractCodes = new Set(
        state.contracts
            .filter(c => c && c.code)
            .map(c => c.code)
    );

    const packZones = ['autobag-1.2', 'autobag-2.5', 'autobag-4.0', 'autobag-rtpb', 'autobag-multi', 'manualpack', 'manualpack-multi', 'ace', 'ws'];
    const pickZones = ['6.1f', '6.3f', '7.1f', '7.2f', '7.3f', '8f', 'agv', 'ws'];

    const packZoneNames = {
        'autobag-1.2': 'Autobag 1.2',
        'autobag-2.5': 'Autobag 2.5',
        'autobag-4.0': 'Autobag 4.0',
        'autobag-rtpb': 'Autobag RTPB',
        'autobag-multi': 'Autobag 멀티',
        'manualpack': 'ManualPack',
        'manualpack-multi': 'ManualPack Multi',
        'ace': 'ACE',
        'ws': 'WS (워터)'
    };

    const pickZoneNames = {
        '6.1f': '6.1F',
        '6.3f': '6.3F',
        '7.1f': '7.1F',
        '7.2f': '7.2F',
        '7.3f': '7.3F',
        '8f': '8F',
        'agv': 'AGV',
        'ws': 'WS (워터)'
    };

    let html = '';
    let hasAnyContract = false;

    // PACK 구역 렌더링
    packZones.forEach(zone => {
        const codes = state.packAssignments[zone] || [];
        // 계약직만 필터링
        const contractMembers = codes.filter(code => code && contractCodes.has(code));

        if (contractMembers.length > 0) {
            hasAnyContract = true;
            html += `<div class="contract-zone-card pack-zone">
                <div class="contract-zone-header">
                    ${packZoneNames[zone]}
                    <span class="zone-type-badge">PACK</span>
                </div>
                <div class="contract-zone-members">`;

            contractMembers.forEach(code => {
                const person = state.contracts.find(c => c && c.code === code);
                const name = person?.name || code;
                html += `<div class="contract-member-item">${name}</div>`;
            });

            html += `</div></div>`;
        }
    });

    // PICK 구역 렌더링
    pickZones.forEach(zone => {
        const codes = state.pickAssignments[zone] || [];
        // 계약직만 필터링
        const contractMembers = codes.filter(code => code && contractCodes.has(code));

        if (contractMembers.length > 0) {
            hasAnyContract = true;
            html += `<div class="contract-zone-card pick-zone">
                <div class="contract-zone-header">
                    ${pickZoneNames[zone]}
                    <span class="zone-type-badge">PICK</span>
                </div>
                <div class="contract-zone-members">`;

            contractMembers.forEach(code => {
                const person = state.contracts.find(c => c && c.code === code);
                const name = person?.name || code;
                html += `<div class="contract-member-item">${name}</div>`;
            });

            html += `</div></div>`;
        }
    });

    // 배치된 계약직이 없는 경우
    if (!hasAnyContract) {
        html = `<div class="contract-board-empty">
            <div class="contract-board-empty-icon">📋</div>
            <div class="contract-board-empty-text">배치된 계약직이 없습니다</div>
        </div>`;
    }

    container.innerHTML = html;
}

// renderAllAssignments를 renderContractBoard로 대체
function renderAllAssignments() {
    renderContractBoard();
}

// Firebase 초기화 (자동 연결)
function initializeFirebase() {
    // 상단에 정의된 firebaseConfig 사용하여 자동 연결
    setTimeout(() => {
        connectToFirebase();
    }, 500);
}

// Firebase 연결
async function connectToFirebase() {
    try {
        // 기존 연결 해제
        if (firebaseApp) {
            disconnectFromFirebase();
        }

        // Firebase 초기화 (상단의 firebaseConfig 사용)
        firebaseApp = firebase.initializeApp(firebaseConfig, 'gwj2-pda-' + Date.now());
        firebaseDb = firebase.database(firebaseApp);
        currentRoomName = state.currentShift === 'DAY' ? 'gwj2-day' : 'gwj2-swing';

        // 연결 상태 모니터링
        updateFirebaseStatus('connecting');
        const connectedRef = firebaseDb.ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                firebaseConnected = true;
                console.log('Firebase 연결됨');
                updateFirebaseStatus('connected');
            } else {
                if (firebaseConnected) {
                    console.log('Firebase 연결 끊김');
                }
                firebaseConnected = false;
                updateFirebaseStatus('disconnected');
            }
        });

        // 실시간 리스너 설정
        setupRealtimeListeners();

        // 프레즌스 연결
        connectPresence();

        // 현재 데이터 업로드 (최초 연결 시)
        await uploadCurrentState();

        // 활동 기록
        addActivity('Firebase 실시간 동기화에 연결되었습니다', 'sync');

    } catch (error) {
        console.error('Firebase 연결 실패:', error);
        updateFirebaseStatus('error');
    }
}

// Firebase 연결 해제
function disconnectFromFirebase() {
    // 리스너 제거
    syncListeners.forEach(listener => {
        if (listener.ref && listener.callback) {
            listener.ref.off('value', listener.callback);
        }
    });
    syncListeners = [];

    // Firebase 앱 삭제
    if (firebaseApp) {
        try {
            firebaseApp.delete();
        } catch (e) {
            console.error('Firebase 앱 삭제 실패:', e);
        }
        firebaseApp = null;
        firebaseDb = null;
    }

    firebaseConnected = false;
}

// 실시간 리스너 설정
function setupRealtimeListeners() {
    if (!firebaseDb) return;

    const roomRef = firebaseDb.ref(`rooms/${currentRoomName}`);

    // PACK 배치 리스너
    const packRef = roomRef.child('packAssignments');
    const packCallback = packRef.on('value', (snapshot) => {
        if (isRemoteUpdate) return;

        const data = snapshot.val();
        if (data) {
            isRemoteUpdate = true;
            const hasChanges = mergeAssignments(state.packAssignments, data);
            if (hasChanges) {
                renderPackTables();
                updateDashboard();
                updateLastSyncTime();
            }
            isRemoteUpdate = false;
        }
    });
    syncListeners.push({ ref: packRef, callback: packCallback });

    // PICK 배치 리스너
    const pickRef = roomRef.child('pickAssignments');
    const pickCallback = pickRef.on('value', (snapshot) => {
        if (isRemoteUpdate) return;

        const data = snapshot.val();
        if (data) {
            isRemoteUpdate = true;
            const hasChanges = mergeAssignments(state.pickAssignments, data);
            if (hasChanges) {
                renderPickTables();
                updateDashboard();
                updateLastSyncTime();
            }
            isRemoteUpdate = false;
        }
    });
    syncListeners.push({ ref: pickRef, callback: pickCallback });

    // 계약직 데이터 리스너
    const contractsRef = roomRef.child('contracts');
    const contractsCallback = contractsRef.on('value', (snapshot) => {
        if (isRemoteUpdate) return;

        const data = snapshot.val();
        if (data && Array.isArray(data)) {
            isRemoteUpdate = true;
            state.contracts = data;
            renderAllTables();
            updateDashboard();
            updateLastSyncTime();
            isRemoteUpdate = false;
        }
    });
    syncListeners.push({ ref: contractsRef, callback: contractsCallback });

    // 단기직 데이터 리스너
    const tempsRef = roomRef.child('temps');
    const tempsCallback = tempsRef.on('value', (snapshot) => {
        if (isRemoteUpdate) return;

        const data = snapshot.val();
        if (data && Array.isArray(data)) {
            isRemoteUpdate = true;
            state.temps = data;
            renderAllTables();
            updateDashboard();
            updateLastSyncTime();
            isRemoteUpdate = false;
        }
    });
    syncListeners.push({ ref: tempsRef, callback: tempsCallback });

    // HTP 데이터 리스너
    const packHTPRef = roomRef.child('packHTP');
    const packHTPCallback = packHTPRef.on('value', (snapshot) => {
        if (isRemoteUpdate) return;

        const data = snapshot.val();
        if (data) {
            isRemoteUpdate = true;
            Object.assign(state.packHTP, data);
            isRemoteUpdate = false;
        }
    });
    syncListeners.push({ ref: packHTPRef, callback: packHTPCallback });

    const pickHTPRef = roomRef.child('pickHTP');
    const pickHTPCallback = pickHTPRef.on('value', (snapshot) => {
        if (isRemoteUpdate) return;

        const data = snapshot.val();
        if (data) {
            isRemoteUpdate = true;
            Object.assign(state.pickHTP, data);
            isRemoteUpdate = false;
        }
    });
    syncListeners.push({ ref: pickHTPRef, callback: pickHTPCallback });
}

// 배치 데이터 병합 (변경 사항만 적용)
function mergeAssignments(target, source) {
    let hasChanges = false;

    Object.keys(source).forEach(zone => {
        if (!target[zone]) {
            target[zone] = [];
        }

        const sourceZone = source[zone] || [];
        const targetZone = target[zone];

        sourceZone.forEach((code, index) => {
            if (targetZone[index] !== code) {
                targetZone[index] = code || '';
                hasChanges = true;
            }
        });
    });

    return hasChanges;
}

// 현재 상태 업로드
async function uploadCurrentState() {
    if (!firebaseDb || !firebaseConnected) return;

    const roomRef = firebaseDb.ref(`rooms/${currentRoomName}`);

    try {
        await roomRef.update({
            packAssignments: state.packAssignments,
            pickAssignments: state.pickAssignments,
            packHTP: state.packHTP,
            pickHTP: state.pickHTP,
            contracts: state.contracts,
            temps: state.temps,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        });
        updateLastSyncTime();
    } catch (error) {
        console.error('데이터 업로드 실패:', error);
    }
}

// Firebase로 데이터 동기화 (디바운스 적용)
function syncToFirebase(path, data) {
    if (!firebaseDb || !firebaseConnected || isRemoteUpdate) return;

    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
        const ref = firebaseDb.ref(`rooms/${currentRoomName}/${path}`);
        ref.set(data).then(() => {
            updateLastSyncTime();
        }).catch(error => {
            console.error('동기화 실패:', error);
        });
    }, SYNC_DEBOUNCE_DELAY);
}

// 특정 구역 동기화
function syncZoneToFirebase(type, zone, assignments) {
    if (!firebaseDb || !firebaseConnected || isRemoteUpdate) return;

    const path = type === 'pack' ? 'packAssignments' : 'pickAssignments';
    const ref = firebaseDb.ref(`rooms/${currentRoomName}/${path}/${zone}`);

    ref.set(assignments).catch(error => {
        console.error('구역 동기화 실패:', error);
    });
}

// 연결 상태 업데이트
function updateFirebaseStatus(status) {
    // 헤더 동기화 상태 표시
    const headerSyncDot = document.getElementById('headerSyncDot');
    const headerSyncText = document.getElementById('headerSyncText');
    const headerSyncStatus = document.getElementById('headerSyncStatus');

    if (headerSyncDot) {
        headerSyncDot.classList.remove('online', 'offline', 'connecting', 'error');
    }
    if (headerSyncStatus) {
        headerSyncStatus.classList.remove('online', 'offline', 'connecting', 'error');
    }

    switch (status) {
        case 'connected':
            if (headerSyncText) headerSyncText.textContent = '실시간 동기화';
            if (headerSyncDot) headerSyncDot.classList.add('online');
            if (headerSyncStatus) headerSyncStatus.classList.add('online');
            break;
        case 'connecting':
            if (headerSyncText) headerSyncText.textContent = '연결 중...';
            if (headerSyncDot) headerSyncDot.classList.add('connecting');
            if (headerSyncStatus) headerSyncStatus.classList.add('connecting');
            break;
        case 'disconnected':
            if (headerSyncText) headerSyncText.textContent = '오프라인';
            if (headerSyncDot) headerSyncDot.classList.add('offline');
            if (headerSyncStatus) headerSyncStatus.classList.add('offline');
            break;
        case 'error':
            if (headerSyncText) headerSyncText.textContent = '연결 오류';
            if (headerSyncDot) headerSyncDot.classList.add('error');
            if (headerSyncStatus) headerSyncStatus.classList.add('error');
            break;
    }
}

// 마지막 동기화 시간 업데이트
function updateLastSyncTime() {
    lastSyncTime = new Date();
    const lastSyncEl = document.getElementById('lastSyncTime');
    if (lastSyncEl) {
        lastSyncEl.textContent = `마지막 동기화: ${lastSyncTime.toLocaleTimeString('ko-KR')}`;
    }
}

// ==================== 프레즌스 시스템 ====================

let presenceRef = null;
let myPresenceRef = null;
let presenceUsername = null;

function setupPresenceSystem() {
    // 사용자 이름 설정 (로컬스토리지에서 가져오거나 랜덤 생성)
    presenceUsername = localStorage.getItem('gwj2_username');
    if (!presenceUsername) {
        const adjectives = ['빠른', '열정적인', '든든한', '멋진', '활기찬', '꼼꼼한', '신속한'];
        const nouns = ['관리자', '매니저', '팀장', '리더', '총괄', '담당자'];
        presenceUsername = adjectives[Math.floor(Math.random() * adjectives.length)] + ' ' +
                          nouns[Math.floor(Math.random() * nouns.length)];
        localStorage.setItem('gwj2_username', presenceUsername);
    }
}

function connectPresence() {
    if (!firebaseDb || !firebaseConnected) return;

    const roomPresenceRef = firebaseDb.ref(`rooms/${currentRoomName}/presence`);

    // 내 프레즌스 등록
    myPresenceRef = roomPresenceRef.push();
    myPresenceRef.set({
        name: presenceUsername,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    // 연결 해제 시 자동 제거
    myPresenceRef.onDisconnect().remove();

    // 30초마다 활동 갱신
    setInterval(() => {
        if (myPresenceRef && firebaseConnected) {
            myPresenceRef.update({
                lastActive: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }, 30000);

    // 프레즌스 리스너
    presenceRef = roomPresenceRef;
    presenceRef.on('value', (snapshot) => {
        const users = snapshot.val() || {};
        renderPresenceUsers(users);
    });
}

function renderPresenceUsers(users) {
    const container = document.getElementById('presenceUsers');
    const presenceBar = document.getElementById('presenceBar');
    if (!container) return;

    const userList = Object.values(users);

    if (userList.length === 0) {
        if (presenceBar) presenceBar.style.display = 'none';
        return;
    }

    if (presenceBar) presenceBar.style.display = 'flex';

    container.innerHTML = userList.map(user => {
        const colors = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899'];
        const color = colors[Math.abs(hashCode(user.name)) % colors.length];
        const initial = user.name.charAt(0);

        return `<div class="presence-user" title="${user.name}">
            <div class="presence-avatar" style="background:${color}">${initial}</div>
            <span class="presence-name">${user.name}</span>
            <span class="presence-dot-indicator"></span>
        </div>`;
    }).join('');
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash;
}

// ==================== 활동 피드 ====================

const activityLog = [];
const MAX_ACTIVITY_ITEMS = 50;

function setupActivityFeed() {
    const closeBtn = document.getElementById('activityFeedClose');
    const feedEl = document.getElementById('activityFeed');

    if (closeBtn && feedEl) {
        closeBtn.addEventListener('click', () => {
            feedEl.classList.remove('active');
        });
    }
}

function addActivity(message, type = 'info') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

    activityLog.unshift({ message, type, time: timeStr, timestamp: now.getTime() });

    // 최대 갯수 유지
    if (activityLog.length > MAX_ACTIVITY_ITEMS) {
        activityLog.pop();
    }

    renderActivityFeed();
}

function renderActivityFeed() {
    const listEl = document.getElementById('activityFeedList');
    if (!listEl) return;

    if (activityLog.length === 0) {
        listEl.innerHTML = '<div class="activity-empty">최근 활동이 없습니다</div>';
        return;
    }

    listEl.innerHTML = activityLog.slice(0, 20).map(item => {
        const icons = {
            'info': 'info',
            'success': 'check_circle',
            'warning': 'warning',
            'error': 'error',
            'move': 'swap_horiz',
            'add': 'person_add',
            'delete': 'person_remove',
            'sync': 'sync'
        };
        const icon = icons[item.type] || 'info';

        return `<div class="activity-item activity-${item.type}">
            <span class="material-icons-round activity-icon">${icon}</span>
            <div class="activity-content">
                <div class="activity-message">${item.message}</div>
                <div class="activity-time">${item.time}</div>
            </div>
        </div>`;
    }).join('');
}

// saveToLocalStorage 함수 수정 - Firebase 동기화 추가
const originalSaveToLocalStorage = saveToLocalStorage;

