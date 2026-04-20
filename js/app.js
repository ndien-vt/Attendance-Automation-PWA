// THAY THẾ BẰNG URL WEB APP CỦA BẠN SAU KHI DEPLOY CODE.GS MỚI
const API_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";

let deferredPrompt;

window.onload = function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker registration failed', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBanner = document.getElementById('install-banner');
    if (installBanner) {
      installBanner.style.display = 'block';
    }
  });

  fetchInitialData();
};

function installPWA() {
  const installBanner = document.getElementById('install-banner');
  installBanner.style.display = 'none';
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
    });
  }
}

async function fetchInitialData() {
  try {
    const response = await fetch(`${API_URL}?action=getInitialWebData`);
    if (!response.ok) throw new Error('Network response was not ok');
    const initData = await response.json();
    if (initData.error) throw new Error(initData.error);
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
  
  if(initData.defaultSheet) {
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
      for(let i=0; i<data.dates.length; i++) { 
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
