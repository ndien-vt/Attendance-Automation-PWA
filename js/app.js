// THAY THẾ BẰNG URL WEB APP CỦA BẠN SAU KHI DEPLOY CODE.GS MỚI
const API_URL = "https://script.google.com/macros/s/AKfycbwIDaUlFyMie7b2gd0bSIyYVeAebCtAxNN__zEVRKwLSENuvytVDtd_fnpYbWT_g23_/exec";
// THAY THẾ BẰNG ONESIGNAL APP ID CỦA BẠN
const ONESIGNAL_APP_ID = "9d15f9fd-00f2-411e-80fa-f3a24f6b4d2b";

// Đường dẫn tuyệt đối của repo trên GitHub Pages
// ⚠️ Nếu đổi tên repo thì cập nhật biến này
const SW_SCOPE = '/Attendance-Automation-PWA/';
// serviceWorkerPath KHÔNG có / ở đầu (theo tài liệu OneSignal chính thức)
const SW_PATH = 'Attendance-Automation-PWA/OneSignalSDKWorker.js';

// Bước 1: Đăng ký SW thủ công (iOS không cho OneSignal tự đăng ký)
// Bước 2: Chờ SW active
// Bước 3: Init OneSignal với đường dẫn SW chính xác
// Đăng ký SW và init OneSignal — KHÔNG chờ .ready vì gây hang trên iOS Standalone
window.OneSignalDeferred = window.OneSignalDeferred || [];
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./OneSignalSDKWorker.js')
    .then(function (reg) {
      console.log('[SW] Registered, scope:', reg.scope);
      // Init OneSignal ngay sau khi register — không cần chờ .ready
      OneSignalDeferred.push(function (OneSignal) {
        OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerParam: { scope: SW_SCOPE },
          serviceWorkerPath: SW_PATH
        }).then(function () {
          console.log('[OneSignal] init OK');
        }).catch(function (e) {
          console.warn('OneSignal init error:', e);
        });
      });
    })
    .catch(function (err) {
      console.warn('[SW] Registration failed:', err);
      // Vẫn init OneSignal dù SW thất bại
      OneSignalDeferred.push(function (OneSignal) {
        OneSignal.init({ appId: ONESIGNAL_APP_ID });
      });
    });
} else {
  OneSignalDeferred.push(function (OneSignal) {
    OneSignal.init({ appId: ONESIGNAL_APP_ID });
  });
}

let deferredPrompt;

let globalEmployeeMapping = {};

document.addEventListener('DOMContentLoaded', function () {
  // Không đăng ký sw.js riêng lẻ vì OneSignal đã quản lý Service Worker
  // Đăng ký 2 SW cùng scope sẽ xung đột và phá vỡ Push Token

  checkLogin();
  fetchInitialData();

  // Tự động lấy version cache từ sw.js để cập nhật footer
  fetch('./sw.js', { cache: 'no-store' })
    .then(res => res.text())
    .then(text => {
      const match = text.match(/lich-lam-viec-v([\d\.]+)/);
      if (match && document.getElementById('app-version')) {
        document.getElementById('app-version').textContent = match[1];
      }
    })
    .catch(err => console.log("Không lấy được version:", err));
});

let currentRole = 'Guest';
let isEditMode = false;
let editedShifts = [];
let targetEditCell = null;

function checkLogin() {
  const savedCode = localStorage.getItem('employeeCode');
  const role = localStorage.getItem('role') || 'Guest';
  if (savedCode) {
    applyUserRole(role, savedCode);
  }
}

function handleGoogleLoginClick() {
  google.accounts.id.initialize({
    client_id: "409153971811-utghb2hjc9dfn17lmed043mk66ep6ojl.apps.googleusercontent.com", // TODO: Thay bằng Client ID thật
    callback: handleCredentialResponse
  });
  google.accounts.id.prompt();
}

function handleCredentialResponse(response) {
  const responsePayload = decodeJwtResponse(response.credential);
  const email = responsePayload.email;
  verifyGoogleLogin(email);
}

function decodeJwtResponse(token) {
  var base64Url = token.split('.')[1];
  var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

async function verifyGoogleLogin(email) {
  document.getElementById('loader-container').style.display = 'flex';
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'verifyGoogleLogin', email: email })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('employeeCode', data.code);
      localStorage.setItem('employeeName', data.name);
      localStorage.setItem('role', data.role);
      applyUserRole(data.role, data.code);
      alert("Đăng nhập thành công! Xin chào " + data.name);
    } else {
      alert("Lỗi: " + data.error);
    }
  } catch (err) {
    alert("Lỗi kết nối: " + err);
  }
  document.getElementById('loader-container').style.display = 'none';
}

function applyUserRole(role, code) {
  currentRole = role;

  const registerBtn = document.getElementById('registerBtn');
  const employeeBadge = document.getElementById('employeeBadge');
  if (registerBtn && employeeBadge) {
    registerBtn.style.display = 'none';
    employeeBadge.style.display = 'inline-block';
    employeeBadge.textContent = "👤 " + code;
  }

  if (role === 'Admin') {
    document.body.classList.add('admin-mode');
    document.getElementById('admin-toolbar').style.display = 'flex';
  } else {
    document.body.classList.remove('admin-mode');
    document.getElementById('admin-toolbar').style.display = 'none';
  }

  if (role !== 'Guest') {
    optInOneSignal(code);
    autoConfirmPending(code);
  }
}

function optInOneSignal(code) {
  const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (isIOS && !isStandalone) return;

  if (window.OneSignal && window.OneSignal.User) {
    window.OneSignal.User.PushSubscription.optIn().then(function () {
      setOneSignalTag(code);
    }).catch(function (e) {
      setOneSignalTag(code);
    });
  }
}

async function autoConfirmPending(code) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'autoConfirm', employeeCode: code })
    });
  } catch (e) { }
}

// =================== EDIT MODE LOGIC ===================
function toggleEditMode() {
  isEditMode = true;
  document.querySelector('.schedule-table').classList.add('edit-mode');
  document.getElementById('editModeBtn').style.display = 'none';
  document.getElementById('saveChangesBtn').style.display = 'inline-block';
  document.getElementById('cancelChangesBtn').style.display = 'inline-block';
}

function cancelEditMode() {
  isEditMode = false;
  editedShifts = [];
  document.querySelector('.schedule-table').classList.remove('edit-mode');
  document.getElementById('editModeBtn').style.display = 'inline-block';
  document.getElementById('saveChangesBtn').style.display = 'none';
  document.getElementById('cancelChangesBtn').style.display = 'none';
  loadSelectedMonth(); // Reload
}

function handleCellClick(td, empName, dateStr) {
  if (!isEditMode || currentRole !== 'Admin') return;
  targetEditCell = { td, empName, dateStr };
  document.getElementById('shift-modal-title').innerText = "Chọn Ca Mới (" + dateStr + ")";
  document.getElementById('shift-modal').style.display = 'flex';
}

function selectShift(newShift) {
  if (!targetEditCell) return;
  const { td, empName, dateStr } = targetEditCell;

  td.innerText = newShift;
  td.className = getShiftClass(newShift) + ' cell-edited';

  let empCode = "";
  for (let code in globalEmployeeMapping) {
    if (globalEmployeeMapping[code] === empName) {
      empCode = code; break;
    }
  }

  const existingIdx = editedShifts.findIndex(s => s.code === empCode && s.date === dateStr);
  if (existingIdx >= 0) {
    editedShifts[existingIdx].newShift = newShift;
  } else {
    editedShifts.push({
      code: empCode,
      date: dateStr,
      sheetName: document.getElementById('month-selector').value,
      newShift: newShift
    });
  }
  closeShiftModal();
}

function closeShiftModal() {
  document.getElementById('shift-modal').style.display = 'none';
  targetEditCell = null;
}

function getShiftClass(val) {
  if (val.startsWith('O') || val === 'CN' || val === 'OFF') return 'cell-off';
  else if (val === 'PH' || val.includes('PH')) return 'cell-ph';
  else if (val.includes('AL') || val.includes('UL') || val.includes('/')) return 'cell-leave';
  else if (val === 'S1+4' || val === 'S3+4') return 'cell-s14';
  else if (val.includes('+')) return 'cell-ot';
  else if (val === 'ADM') return 'cell-adm';
  else return 'cell-std';
}

async function saveEditedShifts() {
  if (editedShifts.length === 0) {
    alert("Chưa có thay đổi nào để lưu.");
    return;
  }

  document.getElementById('loader-container').style.display = 'flex';
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'updateMultipleShifts', changes: editedShifts })
    });
    const data = await res.json();
    if (data.success) {
      alert("Lưu thành công!");
      cancelEditMode();
    } else {
      alert("Lỗi: " + data.error);
    }
  } catch (err) {
    alert("Lỗi kết nối: " + err);
  }
  document.getElementById('loader-container').style.display = 'none';
}
// =======================================================

function setOneSignalTag(code) {
  window.OneSignalDeferred.push(function (OneSignal) {
    try {
      OneSignal.User.addTag("employee_code", code);
      console.log("OneSignal tag updated:", code);

      // Set External ID
      OneSignal.login(code).then(() => {
        console.log("OneSignal logged in with external ID:", code);
      }).catch(err => {
        console.warn("OneSignal login warning:", err);
      });
    } catch (e) {
      console.warn("OneSignal Catch warning:", e.message);
    }
  });
}

async function fetchInitialData() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout cho lần đầu (gộp 2 API)
  try {
    const response = await fetch(`${API_URL}?action=getFullData`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    globalEmployeeMapping = data.employeeMapping || {};
    initDropdown(data);   // data.schedule đã có sẵn, không cần gọi API lần 2
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      onFailure(new Error('Timeout: Không kết nối được server sau 20 giây. Vui lòng thử lại.'));
    } else {
      onFailure(error);
    }
  }
}

function initDropdown(data) {
  const selector = document.getElementById('month-selector');
  selector.innerHTML = '';

  data.sheetNames.forEach(name => {
    let option = document.createElement('option');
    option.value = name;
    option.textContent = "LỊCH LÀM VIỆC " + name;
    selector.appendChild(option);
  });

  if (data.defaultSheet) {
    selector.value = data.defaultSheet;
  }

  // Dữ liệu lịch đã được gộp sẵn trong API — render ngay, không cần gọi API lần 2
  if (data.schedule) {
    renderTable(data.schedule);
  } else {
    loadSelectedMonth(); // Fallback nếu server cũ chưa hỗ trợ getFullData
  }
}

async function loadSelectedMonth() {
  document.getElementById('loader-container').style.display = 'flex';
  document.getElementById('content').style.display = 'none';

  const selectedSheet = document.getElementById('month-selector').value;
  document.title = "Lịch Làm Việc 2026";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
  try {
    const response = await fetch(
      `${API_URL}?action=getScheduleDataForWeb&sheetName=${encodeURIComponent(selectedSheet)}`,
      {
        signal: controller.signal,
        cache: 'no-store'  // Bypass SW cache — luôn lấy lịch mới nhất
      }
    );
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    renderTable(data);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      onFailure(new Error('Timeout: Không tải được lịch sau 15 giây. Vui lòng thử lại.'));
    } else {
      onFailure(error);
    }
  }
}

function renderTable(data) {
  if (data.error) {
    document.getElementById('loading-text').innerHTML = " ❌ Lỗi: " + data.error;
    document.querySelector('.spinner').style.display = 'none';
    return;
  }

  const headerRow1 = document.getElementById('header-dates-row');
  headerRow1.innerHTML = '<th rowspan="2" class="col-name-header">Họ Tên</th>';

  const headerRow2 = document.getElementById('header-days-row');
  headerRow2.innerHTML = '';

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  data.dates.forEach((date, index) => {
    let th = document.createElement('th');
    th.textContent = date; th.className = 'header-date';

    if (data.pastMonthIndices[index]) {
      th.classList.add('past-month');
    }
    headerRow1.appendChild(th);
  });

  data.days.forEach(day => {
    let th = document.createElement('th');
    th.textContent = day; th.className = 'header-day';
    if (day === 'CN' || day === 'Sun') th.classList.add('sunday');
    headerRow2.appendChild(th);
  });

  data.employees.forEach(emp => {
    let tr = document.createElement('tr');
    if (emp.isSeparator) {
      tr.className = 'row-separator';
      let tdName = document.createElement('td'); tdName.className = 'col-name-cell'; tr.appendChild(tdName);
      for (let i = 0; i < data.dates.length; i++) {
        tr.appendChild(document.createElement('td'));
      }
    } else {
      let tdName = document.createElement('td');
      tdName.textContent = emp.name; tdName.className = 'col-name-cell';
      tr.appendChild(tdName);
      emp.shifts.forEach((shift, index) => {
        let td = document.createElement('td');
        let val = shift ? String(shift).trim() : "";
        td.textContent = val;
        td.className = getShiftClass(val);

        let dateStr = data.dates[index];
        td.onclick = function () { handleCellClick(td, emp.name, dateStr); };

        tr.appendChild(td);
      });
    }
    tbody.appendChild(tr);
  });

  document.getElementById('updateTime').textContent = "Cập nhật: " + data.updateTime;
  document.getElementById('loader-container').style.display = 'none';
  document.getElementById('content').style.display = 'flex';
}

function onFailure(error) {
  document.getElementById('loading-text').innerHTML = " ❌ Lỗi: " + error.message;
  document.querySelector('.spinner').style.borderTopColor = 'red';
  document.querySelector('.spinner').style.animation = 'none';
}
