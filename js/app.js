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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./OneSignalSDKWorker.js')
    .then(function(reg) {
      console.log('[SW] Registered, scope:', reg.scope);
      return navigator.serviceWorker.ready;
    })
    .then(function(reg) {
      console.log('[SW] Active and ready, state:', reg.active.state);
      // Bây giờ mới init OneSignal — SW đã sẵn sàng
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      OneSignalDeferred.push(function(OneSignal) {
        OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerParam: { scope: SW_SCOPE },
          serviceWorkerPath: SW_PATH
        }).then(function() {
          console.log('[OneSignal] init OK');
        }).catch(function(e) {
          alert('Lỗi OneSignal init: ' + e);
        });
      });
    })
    .catch(function(err) {
      alert('[SW] Registration failed: ' + err);
    });
} else {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(function(OneSignal) {
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
});

function checkLogin() {
  const savedCode = localStorage.getItem('employeeCode');
  if (savedCode) {
    setOneSignalTag(savedCode);
    updateLoginUI(savedCode);
  }
}

function updateLoginUI(code) {
  const registerBtn = document.getElementById('registerBtn');
  const employeeBadge = document.getElementById('employeeBadge');
  if (registerBtn && employeeBadge) {
    registerBtn.style.display = 'none';
    employeeBadge.style.display = 'inline-block';
    employeeBadge.textContent = "👤 " + code;
  }
}

function forceLogin() {
  const savedCode = localStorage.getItem('employeeCode');
  if (savedCode) {
    document.getElementById('employee-code-input').value = savedCode;
  }
  document.getElementById('login-modal').style.display = 'flex';
}

function saveEmployeeCode() {
  // Kiểm tra iOS Standalone Mode - bắt buộc để push notification hoạt động
  const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  
  if (isIOS && !isStandalone) {
    alert("⚠️ QUAN TRỌNG!\n\nBạn đang mở ứng dụng trong Safari browser thông thường.\n\nĐể nhận thông báo, bạn PHẢI:\n1. Bấm nút Share (ô vuông với mũi tên lên)\n2. Chọn 'Add to Home Screen'\n3. ĐÓNG Safari lại\n4. Mở app từ icon trên Màn hình chính (KHÔNG mở Safari)");
    return;
  }
  
  const codeInput = document.getElementById('employee-code-input').value.trim();
  if (!codeInput) {
    alert("Vui lòng nhập mã nhân viên của bạn.");
    return;
  }
  
  const name = globalEmployeeMapping[codeInput];
  if (!name) {
    alert("Mã nhân viên không tồn tại trong hệ thống. Vui lòng kiểm tra lại!");
    return;
  }
  
  // Lưu thông tin
  localStorage.setItem('employeeCode', codeInput);
  localStorage.setItem('employeeName', name);
  document.getElementById('login-modal').style.display = 'none';
  updateLoginUI(codeInput);
  
  // Gọi optIn() trong user gesture
  if (window.OneSignal && window.OneSignal.User) {
    window.OneSignal.User.PushSubscription.optIn().then(function() {
      setOneSignalTag(codeInput);
      // Kiểm tra SW registrations SAU khi optIn để debug token=NONE
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        setTimeout(function() {
          const token = window.OneSignal.User.PushSubscription.token;
          const optedIn = window.OneSignal.User.PushSubscription.optedIn;
          // Tóm tắt các SW đang active
          const swInfo = regs.length === 0
            ? 'NONE'
            : regs.map(function(r) {
                const scope = r.scope.replace('https://ndien-vt.github.io', '');
                const state = r.active ? r.active.state : 'no-active';
                return scope + '[' + state + ']';
              }).join(' | ');
          if (optedIn && token) {
            alert("✅ Thành công! Xin chào: " + name + "\nThông báo đã bật!");
          } else {
            alert("⚠️ Xin chào: " + name +
                  "\noptedIn=" + optedIn + " | token=" + (token ? "YES" : "NONE") +
                  "\nSW (" + regs.length + "): " + swInfo);
          }
        }, 3000); // 3s để iOS kịp nhận token từ APNs
      });
    }).catch(function(e) {
      setOneSignalTag(codeInput);
      alert("⚠️ Lỗi optIn: " + e);
    });
  } else {
    alert("OneSignal chưa sẵn sàng, thử lại sau vài giây.");
  }
}

function closeLoginModal() {
  document.getElementById('login-modal').style.display = 'none';
}

function setOneSignalTag(code) {
  window.OneSignalDeferred.push(function(OneSignal) {
    try {
      OneSignal.User.addTag("employee_code", code);
      console.log("OneSignal tag updated:", code);
      
      // Set External ID
      OneSignal.login(code).then(() => {
        console.log("OneSignal logged in with external ID:", code);
      }).catch(err => {
        console.warn("OneSignal login warning:", err);
      });
    } catch(e) {
      console.warn("OneSignal Catch warning:", e.message);
    }
  });
}

async function fetchInitialData() {
  try {
    const response = await fetch(`${API_URL}?action=getInitialWebData`);
    if (!response.ok) throw new Error('Network response was not ok');
    const initData = await response.json();
    if (initData.error) throw new Error(initData.error);
    
    globalEmployeeMapping = initData.employeeMapping || {};
    initDropdown(initData);
  } catch (error) {
    onFailure(error);
  }
}

function initDropdown(initData) {
  const selector = document.getElementById('month-selector');
  selector.innerHTML = ''; // Clear existing

  initData.sheetNames.forEach(name => {
    let option = document.createElement('option');
    option.value = name;
    option.textContent = "LỊCH LÀM VIỆC " + name;
    selector.appendChild(option);
  });

  if (initData.defaultSheet) {
    selector.value = initData.defaultSheet;
  }

  loadSelectedMonth();
}

async function loadSelectedMonth() {
  document.getElementById('loader-container').style.display = 'flex';
  document.getElementById('content').style.display = 'none';

  const selectedSheet = document.getElementById('month-selector').value;
  document.title = "Lịch Làm Việc 2026";

  try {
    const response = await fetch(`${API_URL}?action=getScheduleDataForWeb&sheetName=${encodeURIComponent(selectedSheet)}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    renderTable(data);
  } catch (error) {
    onFailure(error);
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
      emp.shifts.forEach(shift => {
        let td = document.createElement('td');
        let val = shift ? String(shift).trim() : "";
        td.textContent = val;
        if (val.startsWith('O') || val === 'CN' || val === 'OFF')
          td.className = 'cell-off';
        else if (val === 'PH' || val.includes('PH')) td.className = 'cell-ph';
        else if (val.includes('AL') || val.includes('UL') || val.includes('/')) td.className = 'cell-leave';
        else if (val.includes('+')) td.className = 'cell-ot';
        else if (val === 'ADM') td.className = 'cell-adm';
        else td.className = 'cell-std';
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
