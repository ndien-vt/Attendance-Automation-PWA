// THAY THẾ BẰNG URL WEB APP CỦA BẠN SAU KHI DEPLOY CODE.GS MỚI
const API_URL = "https://script.google.com/macros/s/AKfycbwIDaUlFyMie7b2gd0bSIyYVeAebCtAxNN__zEVRKwLSENuvytVDtd_fnpYbWT_g23_/exec";
// THAY THẾ BẰNG ONESIGNAL APP ID CỦA BẠN
const ONESIGNAL_APP_ID = "9d15f9fd-00f2-411e-80fa-f3a24f6b4d2b";

// Đường dẫn tuyệt đối của repo trên GitHub Pages
// ⚠️ Nếu đổi tên repo thì cập nhật biến này
const SW_BASE_PATH = '/Attendance-Automation-PWA/';

window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(function(OneSignal) {
  OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    serviceWorkerParam: { scope: SW_BASE_PATH },
    serviceWorkerPath: SW_BASE_PATH + 'OneSignalSDKWorker.js'
  }).then(function() {
    console.log('OneSignal init OK, scope:', SW_BASE_PATH);
  }).catch(e => {
    alert('Lỗi OneSignal init: ' + e);
  });
});

let deferredPrompt;

let globalEmployeeMapping = {};

window.onload = function () {
  // Không đăng ký sw.js riêng lẻ vì OneSignal đã quản lý Service Worker
  // Đăng ký 2 SW cùng scope sẽ xung đột và phá vỡ Push Token

  checkLogin();
  fetchInitialData();
};

function checkLogin() {
  const savedCode = localStorage.getItem('employeeCode');
  if (savedCode) {
    setOneSignalTag(savedCode);
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
  
  // Gọi optIn() TRỰC TIẾP trong user gesture — nó tự xử lý cả requestPermission lẫn subscribe
  // KHÔNG tách requestPermission() riêng — tránh iOS hiểu nhầm là 2 gesture khác nhau
  if (window.OneSignal && window.OneSignal.User) {
    window.OneSignal.User.PushSubscription.optIn().then(function() {
      setOneSignalTag(codeInput);
      // Delay 1.5s để iOS kịp cấp push token trước khi đọc trạng thái
      setTimeout(function() {
        const token = window.OneSignal.User.PushSubscription.token;
        const optedIn = window.OneSignal.User.PushSubscription.optedIn;
        const nativePerm = (typeof Notification !== 'undefined') ? Notification.permission : 'N/A';
        if (optedIn && token) {
          alert("✅ Đăng ký thành công! Xin chào: " + name + "\nThông báo đã được bật!");
        } else {
          // Hiện debug để xác định chính xác vấn đề
          alert("⚠️ Xin chào: " + name +
                "\n[DEBUG] optedIn=" + optedIn +
                " | token=" + (token ? "YES" : "NONE") +
                " | perm=" + nativePerm +
                "\nScope SW: " + SW_BASE_PATH);
        }
      }, 1500);
    }).catch(function(e) {
      setOneSignalTag(codeInput);
      alert("⚠️ Xin chào: " + name + "\nLỗi optIn: " + e);
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
        alert("Lỗi Login: " + err);
      });
    } catch(e) {
      alert("Lỗi OneSignal Catch: " + e.message);
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
