// Application State
const state = {
  connected: false,
  config: { host: 'localhost', port: 3306, user: 'root', database: '' },
  tables: [],
  filteredTables: [],
  activeView: 'tables', // 'tables' | 'query'
  currentTable: null,
  currentSchema: null,
  currentPage: 1,
  pageSize: 20,
  totalPages: 1,
  totalRecords: 0,
  searchQuery: '',
  sortBy: null,
  sortOrder: 'ASC',
  modalMode: 'add', // 'add' | 'edit'
  editingRecord: null,
  deletingRecord: null,
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  checkConnectionStatus();

  // Setup SQL query keyboard shortcut
  const sqlInput = document.getElementById('sqlInput');
  if (sqlInput) {
    sqlInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeSqlQuery();
      }
    });
  }

  // Smooth Horizontal Scrolling with Mouse Wheel & Shift
  const tableCard = document.getElementById('tableCardContainer');
  if (tableCard) {
    tableCard.addEventListener('wheel', (e) => {
      // If table overflows horizontally, scroll sideways
      if (tableCard.scrollWidth > tableCard.clientWidth) {
        if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          tableCard.scrollLeft += e.deltaY;
        }
      }
    }, { passive: true });
  }

  // Quick Double-Click to Copy Cell Value
  const tbody = document.getElementById('recordsTbody');
  if (tbody) {
    tbody.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td');
      if (td && !td.querySelector('button')) {
        const text = td.innerText.trim();
        if (text && text !== '<null>') {
          navigator.clipboard.writeText(text);
          showToast(`Copied "${text.length > 30 ? text.substring(0, 27) + '...' : text}" to clipboard!`, 'info');
        }
      }
    });
  }

  // Keyboard shortcut: Press / to search tables
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('tableSearchInput')?.focus();
    }
  });
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  
  const colors = {
    success: 'bg-white border-emerald-200 text-emerald-800 shadow-lg shadow-emerald-500/10',
    error: 'bg-white border-rose-200 text-rose-800 shadow-lg shadow-rose-500/10',
    info: 'bg-white border-blue-200 text-blue-800 shadow-lg shadow-blue-500/10'
  };

  const icons = {
    success: 'check-circle',
    error: 'alert-circle',
    info: 'info'
  };

  toast.className = `toast flex items-center space-x-2 px-4 py-3 rounded-xl border text-xs font-medium ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 flex-shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Connection Status Check
async function checkConnectionStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.connected = data.connected;

    if (data.config) {
      state.config = data.config;
      document.getElementById('cfgHost').value = data.config.host || 'localhost';
      document.getElementById('cfgPort').value = data.config.port || 3306;
      document.getElementById('cfgUser').value = data.config.user || 'root';
      document.getElementById('cfgDatabase').value = data.config.database || '';
    }

    updateConnectionUI(data);

    if (data.connected && data.config.database) {
      fetchTables();
    } else {
      openSettingsModal();
    }
  } catch (err) {
    updateConnectionUI({ connected: false, message: 'Server unreachable' });
  }
}

function updateConnectionUI(data) {
  const badge = document.getElementById('connectionStatusBadge');
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const dbLabel = document.getElementById('currentDbLabel');
  const subtitle = document.getElementById('headerSubtitle');

  if (data.connected) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    text.textContent = `Connected: ${data.config.database}`;
    text.className = 'text-emerald-700 font-mono font-semibold';
    badge.className = 'flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700';
    dbLabel.textContent = `DB: ${data.config.database}`;
    subtitle.textContent = `${data.config.user}@${data.config.host}:${data.config.port}`;
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-rose-500 animate-pulse';
    text.textContent = 'Disconnected';
    text.className = 'text-rose-700 font-medium';
    badge.className = 'flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700';
    dbLabel.textContent = 'DB: None';
    subtitle.textContent = 'Database CRUD Management';
  }
}

// Switch between Tables view and SQL Console
function switchMainView(view) {
  state.activeView = view;
  const navTablesBtn = document.getElementById('navTablesBtn');
  const navQueryBtn = document.getElementById('navQueryBtn');
  const tableView = document.getElementById('tableView');
  const queryView = document.getElementById('queryView');

  if (view === 'tables') {
    navTablesBtn.className = 'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 transition';
    navQueryBtn.className = 'w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition';
    tableView.classList.remove('hidden');
    queryView.classList.add('hidden');
  } else {
    navQueryBtn.className = 'w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 transition';
    navTablesBtn.className = 'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition';
    queryView.classList.remove('hidden');
    tableView.classList.add('hidden');
  }
}

// Fetch tables
async function fetchTables() {
  const container = document.getElementById('tablesListContainer');
  const badge = document.getElementById('tableCountBadge');
  
  try {
    container.innerHTML = `
      <div class="text-center py-6 px-4 text-xs text-slate-400">
        <i data-lucide="loader-2" class="w-4 h-4 mx-auto mb-1 animate-spin text-brand-500"></i>
        Loading tables...
      </div>
    `;
    lucide.createIcons();

    const res = await fetch('/api/tables');
    const data = await res.json();

    if (data.error) {
      container.innerHTML = `<div class="p-3 text-xs text-rose-600 text-center font-medium">${data.error}</div>`;
      return;
    }

    state.tables = data.tables || [];
    state.filteredTables = [...state.tables];
    badge.textContent = state.tables.length;

    renderTableList();

    // Auto-select first table if none selected
    if (state.tables.length > 0 && !state.currentTable) {
      selectTable(state.tables[0].name);
    }
  } catch (err) {
    container.innerHTML = `<div class="p-3 text-xs text-rose-600 text-center font-medium">Failed to load tables</div>`;
  }
}

function getTableIcon(name) {
  const map = {
    candidate: 'users',
    application: 'file-text',
    vacancy: 'briefcase',
    department: 'building-2',
    skill: 'award',
    candidate_skill: 'tags',
    interview_round: 'calendar-clock',
    interview_panel: 'user-check',
    evaluation: 'clipboard-check',
    schedule: 'calendar',
    offer: 'badge-check',
    joining: 'check-circle-2',
    qualification: 'graduation-cap'
  };
  return map[name.toLowerCase()] || 'table-2';
}

function renderTableList() {
  const container = document.getElementById('tablesListContainer');
  if (state.filteredTables.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No tables found</div>`;
    return;
  }

  container.innerHTML = state.filteredTables.map(t => {
    const isActive = t.name === state.currentTable;
    const icon = getTableIcon(t.name);
    return `
      <button onclick="selectTable('${t.name}')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition text-left group ${
        isActive 
          ? 'bg-blue-50/90 text-brand-700 font-bold border border-blue-200/90 shadow-2xs' 
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
      }">
        <div class="flex items-center space-x-2.5 truncate">
          <i data-lucide="${icon}" class="w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}"></i>
          <span class="truncate font-mono">${t.name}</span>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-100/80 text-brand-800 font-extrabold' : 'bg-slate-100 text-slate-500 font-medium'}">${t.rowCount}</span>
      </button>
    `;
  }).join('');

  lucide.createIcons();
}

function filterTableList() {
  const query = document.getElementById('tableSearchInput').value.toLowerCase().trim();
  state.filteredTables = state.tables.filter(t => t.name.toLowerCase().includes(query));
  renderTableList();
}

// Select a Table
async function selectTable(tableName) {
  state.currentTable = tableName;
  state.currentPage = 1;
  state.searchQuery = '';
  state.sortBy = null;
  state.sortOrder = 'ASC';

  const searchInput = document.getElementById('recordSearchInput');
  if (searchInput) searchInput.value = '';

  const crumb = document.getElementById('headerActiveTableCrumb');
  if (crumb) crumb.textContent = tableName;

  const headerIcon = document.getElementById('tableHeaderIcon');
  if (headerIcon) {
    headerIcon.innerHTML = `<i data-lucide="${getTableIcon(tableName)}" class="w-5 h-5"></i>`;
  }

  renderTableList();
  switchMainView('tables');

  document.getElementById('activeTableName').textContent = tableName;
  document.getElementById('activeTableDesc').textContent = `Manage rows and schema for table \`${tableName}\``;
  document.getElementById('tableActionControls').style.display = 'flex';
  document.getElementById('noTableSelectedState').classList.add('hidden');
  document.getElementById('recordsTable').classList.remove('hidden');
  document.getElementById('paginationBar').style.display = 'flex';

  // Load Schema then Data
  await loadTableSchema(tableName);
  await loadTableData();
}

// Export Table to CSV
function exportTableToCsv() {
  if (!state.currentTable || !state.currentSchema) return;
  const tbody = document.getElementById('recordsTbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  if (rows.length === 0 || rows[0].querySelector('td[colspan]')) {
    showToast('No records available to export', 'info');
    return;
  }

  const cols = state.currentSchema.columns.map(c => c.name);
  const csvRows = [cols.join(',')];

  rows.forEach(tr => {
    const tds = Array.from(tr.querySelectorAll('td')).slice(1);
    const rowValues = tds.map(td => {
      let val = td.innerText.replace(/"/g, '""');
      if (val === '<null>') val = '';
      return `"${val}"`;
    });
    csvRows.push(rowValues.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${state.currentTable}_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Exported ${rows.length} rows to CSV!`, 'success');
}

// Load Schema
async function loadTableSchema(tableName) {
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(tableName)}/schema`);
    const data = await res.json();
    state.currentSchema = data;
  } catch (err) {
    showToast('Failed to fetch table schema: ' + err.message, 'error');
  }
}

// Load Data
async function loadTableData() {
  if (!state.currentTable) return;

  const tbody = document.getElementById('recordsTbody');
  const thead = document.getElementById('recordsThead');
  
  tbody.innerHTML = `
    <tr>
      <td colspan="50" class="py-12 text-center text-xs text-slate-400">
        <i data-lucide="loader-2" class="w-5 h-5 mx-auto mb-2 animate-spin text-brand-500"></i>
        Loading records...
      </td>
    </tr>
  `;
  lucide.createIcons();

  try {
    const params = new URLSearchParams({
      page: state.currentPage,
      limit: state.pageSize,
    });
    if (state.searchQuery) params.append('search', state.searchQuery);
    if (state.sortBy) {
      params.append('sortBy', state.sortBy);
      params.append('sortOrder', state.sortOrder);
    }

    const res = await fetch(`/api/tables/${encodeURIComponent(state.currentTable)}/data?${params.toString()}`);
    const data = await res.json();

    if (data.error) {
      tbody.innerHTML = `<tr><td colspan="50" class="py-8 text-center text-xs text-rose-600 font-medium">${data.error}</td></tr>`;
      return;
    }

    // Update Pagination State
    state.currentPage = data.pagination.page;
    state.pageSize = data.pagination.limit;
    state.totalRecords = data.pagination.totalRecords;
    state.totalPages = data.pagination.totalPages;

    updatePaginationUI();

    // Render Headers
    if (state.currentSchema && state.currentSchema.columns) {
      thead.innerHTML = `
        <tr>
          <th class="py-3 px-4 font-bold text-slate-600 uppercase tracking-wider text-[10px] w-24 bg-slate-50 border-b border-slate-200">Actions</th>
          ${state.currentSchema.columns.map(col => {
            const isPK = col.columnKey === 'PRI';
            const isSorted = state.sortBy === col.name;
            const sortIcon = isSorted 
              ? (state.sortOrder === 'ASC' ? '▲' : '▼') 
              : '';

            return `
              <th onclick="toggleSort('${col.name}')" class="py-3 px-4 font-bold text-slate-700 uppercase tracking-wider text-[10px] cursor-pointer hover:bg-blue-50/60 transition select-none bg-slate-50 border-b border-slate-200">
                <div class="flex items-center space-x-1.5">
                  ${isPK ? '<span title="Primary Key" class="text-amber-500">🔑</span>' : ''}
                  <span class="font-mono text-slate-800">${col.name}</span>
                  <span class="text-[9px] text-slate-400 font-normal">(${col.type})</span>
                  <span class="text-brand-600 font-bold ml-1">${sortIcon}</span>
                </div>
              </th>
            `;
          }).join('')}
        </tr>
      `;
    }

    // Render Rows
    if (!data.records || data.records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="50" class="py-12 text-center text-xs text-slate-400">
            No records found ${state.searchQuery ? 'matching search query' : 'in this table'}.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.records.map((row, idx) => {
      const rowJson = encodeURIComponent(JSON.stringify(row));
      return `
        <tr class="table-row-animate hover:bg-blue-50/40 transition group border-b border-slate-100">
          <td class="py-2.5 px-4">
            <div class="flex items-center space-x-1">
              <button onclick="openEditModal('${rowJson}')" class="p-1 rounded hover:bg-blue-100/70 text-brand-600 hover:text-brand-800 transition" title="Edit Record">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="openDeleteModal('${rowJson}')" class="p-1 rounded hover:bg-rose-100/70 text-slate-400 hover:text-rose-600 transition" title="Delete Record">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
          ${state.currentSchema.columns.map(col => {
            const val = row[col.name];
            let displayVal;
            if (col.name === 'skills' && val) {
              const badges = String(val).split(', ').map(s => 
                `<span class="inline-block bg-blue-50 text-brand-700 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-blue-200">${escapeHtml(s)}</span>`
              ).join(' ');
              displayVal = `<div class="flex flex-wrap gap-1 max-w-sm">${badges}</div>`;
            } else if (['candidate_name', 'vacancy_title', 'skill_name'].includes(col.name) && val) {
              displayVal = `<span class="text-brand-700 font-semibold">${escapeHtml(String(val))}</span>`;
            } else if (val === null || val === undefined) {
              displayVal = '<span class="text-slate-400 italic">&lt;null&gt;</span>';
            } else if (typeof val === 'boolean') {
              displayVal = `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${val ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'}">${val}</span>`;
            } else {
              displayVal = escapeHtml(String(val));
            }
            return `<td class="py-2.5 px-4 text-slate-700 max-w-xs truncate" title="${escapeHtml(String(val ?? ''))}">${displayVal}</td>`;
          }).join('')}
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="50" class="py-8 text-center text-xs text-rose-600">Error loading data: ${err.message}</td></tr>`;
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

// Sorting
function toggleSort(colName) {
  if (state.sortBy === colName) {
    if (state.sortOrder === 'ASC') {
      state.sortOrder = 'DESC';
    } else {
      state.sortBy = null;
      state.sortOrder = 'ASC';
    }
  } else {
    state.sortBy = colName;
    state.sortOrder = 'ASC';
  }
  loadTableData();
}

// Search
function handleSearchKey(event) {
  if (event.key === 'Enter') {
    state.searchQuery = event.target.value.trim();
    state.currentPage = 1;
    toggleClearSearchBtn();
    loadTableData();
  }
}

function clearSearch() {
  document.getElementById('recordSearchInput').value = '';
  state.searchQuery = '';
  state.currentPage = 1;
  toggleClearSearchBtn();
  loadTableData();
}

function toggleClearSearchBtn() {
  const btn = document.getElementById('clearSearchBtn');
  if (state.searchQuery) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// Pagination Controls
function updatePaginationUI() {
  const start = state.totalRecords === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
  const end = Math.min(state.currentPage * state.pageSize, state.totalRecords);
  
  document.getElementById('paginationInfo').textContent = `Showing ${start}-${end} of ${state.totalRecords} records`;
  document.getElementById('currentPageIndicator').textContent = `Page ${state.currentPage} of ${state.totalPages}`;
  
  document.getElementById('prevPageBtn').disabled = state.currentPage <= 1;
  document.getElementById('nextPageBtn').disabled = state.currentPage >= state.totalPages;

  const rowCountBadge = document.getElementById('activeTableRowCount');
  rowCountBadge.textContent = `${state.totalRecords} rows`;
  rowCountBadge.classList.remove('hidden');
}

function changePage(delta) {
  const newPage = state.currentPage + delta;
  if (newPage >= 1 && newPage <= state.totalPages) {
    state.currentPage = newPage;
    loadTableData();
  }
}

function changeLimit(newLimit) {
  state.pageSize = parseInt(newLimit, 10);
  state.currentPage = 1;
  loadTableData();
}

// ADD & EDIT RECORD MODAL
function openAddModal() {
  state.modalMode = 'add';
  state.editingRecord = null;

  document.getElementById('recordModalTitle').textContent = `Add Record to \`${state.currentTable}\``;
  document.getElementById('recordModalIcon').innerHTML = '<i data-lucide="plus" class="w-4 h-4 text-brand-600"></i>';
  buildRecordFormFields(null);
  document.getElementById('recordModal').classList.remove('hidden');
  lucide.createIcons();
}

function openEditModal(encodedRow) {
  const row = JSON.parse(decodeURIComponent(encodedRow));
  state.modalMode = 'edit';
  state.editingRecord = row;

  document.getElementById('recordModalTitle').textContent = `Edit Record in \`${state.currentTable}\``;
  document.getElementById('recordModalIcon').innerHTML = '<i data-lucide="edit-2" class="w-4 h-4 text-brand-600"></i>';
  buildRecordFormFields(row);
  document.getElementById('recordModal').classList.remove('hidden');
  lucide.createIcons();
}

function closeRecordModal() {
  document.getElementById('recordModal').classList.add('hidden');
}

function buildRecordFormFields(row) {
  const container = document.getElementById('recordFormFields');
  if (!state.currentSchema || !state.currentSchema.columns) return;

  container.innerHTML = state.currentSchema.columns
    .filter(col => !col.isVirtual)
    .map(col => {
    const isPK = col.columnKey === 'PRI';
    const isAutoIncrement = col.extra && col.extra.toLowerCase().includes('auto_increment');
    const value = row ? (row[col.name] ?? '') : '';
    const isRequired = col.isNullable === 'NO' && !isAutoIncrement && col.defaultValue === null;

    if (state.modalMode === 'add' && isAutoIncrement) {
      return `
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">
            ${col.name} <span class="text-[10px] text-slate-400 font-mono">(${col.fullType})</span>
          </label>
          <input type="text" disabled placeholder="⚡ Auto-incremented ID" class="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 italic">
        </div>
      `;
    }

    const inputHtml = getFieldInputHtml(col, value, isPK && state.modalMode === 'edit');

    return `
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
            ${isPK ? '<span title="Primary Key" class="text-amber-500">🔑</span>' : ''}
            <span>${col.name}</span>
            <span class="text-[10px] text-slate-400 font-mono">(${col.fullType})</span>
          </label>
          ${isRequired ? '<span class="text-[10px] text-rose-500 font-semibold">Required</span>' : '<span class="text-[10px] text-slate-400">Optional</span>'}
        </div>
        ${inputHtml}
      </div>
    `;
  }).join('');
}

function getFieldInputHtml(col, val, disabled = false) {
  const type = col.type.toLowerCase();
  const name = col.name;
  const disabledAttr = disabled ? 'disabled' : '';

  if (['text', 'mediumtext', 'longtext', 'json'].includes(type)) {
    return `<textarea name="${name}" rows="3" ${disabledAttr} class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:bg-white focus:border-brand-500">${escapeHtml(String(val))}</textarea>`;
  }

  if (['int', 'bigint', 'smallint', 'tinyint', 'mediumint', 'decimal', 'float', 'double'].includes(type)) {
    const step = ['decimal', 'float', 'double'].includes(type) ? 'any' : '1';
    return `<input type="number" step="${step}" name="${name}" value="${escapeHtml(String(val))}" ${disabledAttr} class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-brand-500">`;
  }

  if (type === 'date') {
    return `<input type="date" name="${name}" value="${escapeHtml(String(val))}" ${disabledAttr} class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-brand-500">`;
  }

  if (['datetime', 'timestamp'].includes(type)) {
    let formattedVal = val ? String(val).replace(' ', 'T').substring(0, 16) : '';
    return `<input type="datetime-local" name="${name}" value="${formattedVal}" ${disabledAttr} class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-brand-500">`;
  }

  return `<input type="text" name="${name}" value="${escapeHtml(String(val))}" ${disabledAttr} class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-brand-500">`;
}

async function handleRecordFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = {};

  formData.forEach((value, key) => {
    data[key] = value;
  });

  const saveBtn = document.getElementById('saveRecordBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    let res;
    if (state.modalMode === 'add') {
      res = await fetch(`/api/tables/${encodeURIComponent(state.currentTable)}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      const where = {};
      const pkNames = state.currentSchema.primaryKeys.length > 0
        ? state.currentSchema.primaryKeys
        : Object.keys(state.editingRecord);

      pkNames.forEach(pk => {
        where[pk] = state.editingRecord[pk];
      });

      res = await fetch(`/api/tables/${encodeURIComponent(state.currentTable)}/data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ where, data })
      });
    }

    const result = await res.json();
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      showToast(state.modalMode === 'add' ? 'Record created successfully!' : 'Record updated successfully!', 'success');
      closeRecordModal();
      loadTableData();
      fetchTables();
    }
  } catch (err) {
    showToast('Failed to save record: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Record';
  }
}

// DELETE RECORD MODAL
function openDeleteModal(encodedRow) {
  state.deletingRecord = JSON.parse(decodeURIComponent(encodedRow));
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.add('hidden');
  state.deletingRecord = null;
}

async function confirmDeleteRecord() {
  if (!state.deletingRecord) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const where = {};
    const pkNames = state.currentSchema.primaryKeys.length > 0
      ? state.currentSchema.primaryKeys
      : Object.keys(state.deletingRecord);

    pkNames.forEach(pk => {
      where[pk] = state.deletingRecord[pk];
    });

    const res = await fetch(`/api/tables/${encodeURIComponent(state.currentTable)}/data`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ where })
    });

    const result = await res.json();
    if (result.error) {
      showToast(result.error, 'error');
    } else {
      showToast('Record deleted successfully!', 'success');
      closeDeleteModal();
      loadTableData();
      fetchTables();
    }
  } catch (err) {
    showToast('Failed to delete record: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Yes, Delete';
  }
}

// SQL QUERY CONSOLE
async function executeSqlQuery() {
  const sql = document.getElementById('sqlInput').value.trim();
  const resultArea = document.getElementById('queryResultArea');
  const statsSpan = document.getElementById('queryStats');

  if (!sql) {
    showToast('Please type a SQL query first', 'info');
    return;
  }

  resultArea.innerHTML = `
    <div class="h-full flex items-center justify-center text-xs text-slate-400">
      <i data-lucide="loader-2" class="w-5 h-5 animate-spin mr-2 text-brand-600"></i>
      Executing query...
    </div>
  `;
  lucide.createIcons();

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql })
    });
    const data = await res.json();

    if (!data.success) {
      statsSpan.textContent = `Error (${data.duration || 0}ms)`;
      statsSpan.className = 'text-rose-600 font-semibold';
      resultArea.innerHTML = `
        <div class="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-mono text-rose-700">
          <p class="font-bold mb-1">SQL Execution Error:</p>
          <p>${escapeHtml(data.error)}</p>
        </div>
      `;
      return;
    }

    statsSpan.textContent = `Completed in ${data.duration}ms`;
    statsSpan.className = 'text-emerald-700 font-semibold';

    if (data.type === 'select') {
      if (data.rows.length === 0) {
        resultArea.innerHTML = `
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
            Query returned 0 rows.
          </div>
        `;
        return;
      }

      resultArea.innerHTML = `
        <div class="rounded-xl border border-slate-200 overflow-x-auto bg-white shadow-xs">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                ${data.columns.map(c => `<th class="py-2.5 px-4 font-mono font-bold text-slate-700">${escapeHtml(c)}</th>`).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-mono text-[11px] text-slate-800">
              ${data.rows.map(row => `
                <tr class="hover:bg-blue-50/50">
                  ${data.columns.map(c => {
                    const val = row[c];
                    return `<td class="py-2 px-4 text-slate-700">${val === null ? '<span class="text-slate-400 font-normal">&lt;null&gt;</span>' : escapeHtml(String(val))}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      resultArea.innerHTML = `
        <div class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800">
          <p class="font-bold mb-1">Query Executed Successfully</p>
          <p>Affected Rows: ${data.affectedRows} ${data.insertId ? `| Insert ID: ${data.insertId}` : ''}</p>
        </div>
      `;
      fetchTables();
      if (state.currentTable) loadTableData();
    }
  } catch (err) {
    statsSpan.textContent = 'Network Error';
    statsSpan.className = 'text-rose-600 font-semibold';
    resultArea.innerHTML = `<div class="p-4 text-xs text-rose-600">Failed to communicate with server: ${err.message}</div>`;
  }
}

// CONNECTION SETTINGS MODAL
function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('connMsg').classList.add('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function testConnectionAndLoadDatabases() {
  const host = document.getElementById('cfgHost').value.trim();
  const port = document.getElementById('cfgPort').value.trim();
  const user = document.getElementById('cfgUser').value.trim();
  const password = document.getElementById('cfgPassword').value;
  const msgBox = document.getElementById('connMsg');
  const dbSelect = document.getElementById('cfgDatabaseSelect');

  msgBox.className = 'text-xs p-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 block';
  msgBox.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 inline animate-spin mr-1 text-brand-600"></i> Testing connection...';
  lucide.createIcons();

  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password, database: '' })
    });
    const data = await res.json();

    if (data.success && data.databases && data.databases.length > 0) {
      msgBox.className = 'text-xs p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 block';
      msgBox.textContent = `Found ${data.databases.length} databases! Pick one below or type its name.`;

      dbSelect.innerHTML = '<option value="">-- Choose Discovered Database --</option>' +
        data.databases.map(d => `<option value="${d}">${d}</option>`).join('');
      dbSelect.classList.remove('hidden');
    } else if (data.success) {
      msgBox.className = 'text-xs p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 block';
      msgBox.textContent = 'Connected to MySQL! Please enter your database name.';
    } else {
      msgBox.className = 'text-xs p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 block';
      msgBox.textContent = 'Connection failed: ' + data.message;
    }
  } catch (err) {
    msgBox.className = 'text-xs p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 block';
    msgBox.textContent = 'Error: ' + err.message;
  }
}

async function handleConnectionSubmit(event) {
  event.preventDefault();
  const host = document.getElementById('cfgHost').value.trim();
  const port = document.getElementById('cfgPort').value.trim();
  const user = document.getElementById('cfgUser').value.trim();
  const password = document.getElementById('cfgPassword').value;
  const database = document.getElementById('cfgDatabase').value.trim();
  const msgBox = document.getElementById('connMsg');
  const saveBtn = document.getElementById('saveConnBtn');

  if (!database) {
    msgBox.className = 'text-xs p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 block';
    msgBox.textContent = 'Please enter or select a database name.';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Connecting...';

  try {
    const res = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password, database })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message, 'success');
      state.connected = true;
      state.config = data.currentConfig;
      updateConnectionUI({ connected: true, config: state.config });
      closeSettingsModal();
      fetchTables();
    } else {
      msgBox.className = 'text-xs p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 block';
      msgBox.textContent = 'Connection failed: ' + data.message;
    }
  } catch (err) {
    msgBox.className = 'text-xs p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 block';
    msgBox.textContent = 'Request failed: ' + err.message;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Connect & Save';
  }
}

// CANDIDATE & APPLICATION COMPOSITE WORKFLOW MODAL
async function openCandidateAppModal() {
  const modal = document.getElementById('candidateAppModal');
  modal.classList.remove('hidden');
  
  // Set default applied date to today
  document.getElementById('appAppliedOn').value = new Date().toISOString().split('T')[0];
  
  await loadCandidateAppFormMetadata();
  lucide.createIcons();
}

function closeCandidateAppModal() {
  document.getElementById('candidateAppModal').classList.add('hidden');
  document.getElementById('candidateAppForm').reset();
}

async function loadCandidateAppFormMetadata() {
  const vacancySelect = document.getElementById('appVacancyId');
  const skillsContainer = document.getElementById('skillsCheckboxContainer');

  try {
    const res = await fetch('/api/candidate-form-metadata');
    const data = await res.json();

    // Populate Vacancies
    if (data.vacancies && data.vacancies.length > 0) {
      vacancySelect.innerHTML = '<option value="">-- Select Vacancy --</option>' +
        data.vacancies.map(v => `<option value="${v.vacancy_id}">${escapeHtml(v.title)}</option>`).join('');
    } else {
      vacancySelect.innerHTML = '<option value="">No vacancies found</option>';
    }

    // Populate Skills
    if (data.skills && data.skills.length > 0) {
      skillsContainer.innerHTML = data.skills.map(s => `
        <label class="flex items-center space-x-1.5 p-1 rounded hover:bg-white text-slate-700 cursor-pointer transition">
          <input type="checkbox" name="skills" value="${s.skill_id}" class="rounded text-brand-600 focus:ring-brand-500">
          <span class="truncate">${escapeHtml(s.skill_name)}</span>
        </label>
      `).join('');
    } else {
      skillsContainer.innerHTML = '<div class="col-span-3 text-slate-400 p-2">No skills registered</div>';
    }
  } catch (err) {
    showToast('Failed to load form options: ' + err.message, 'error');
  }
}

async function handleCandidateAppSubmit(event) {
  event.preventDefault();
  const saveBtn = document.getElementById('saveCandidateAppBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Saving...</span>';
  lucide.createIcons();

  const candidate = {
    name: document.getElementById('candName').value.trim(),
    email: document.getElementById('candEmail').value.trim(),
    phone: document.getElementById('candPhone').value.trim() || null,
    date_of_birth: document.getElementById('candDob').value || null,
    gender: document.getElementById('candGender').value || null,
    address: document.getElementById('candAddress').value.trim() || null,
    resume_path: document.getElementById('candResumePath').value.trim() || null
  };

  const application = {
    vacancy_id: parseInt(document.getElementById('appVacancyId').value, 10),
    status: document.getElementById('appStatus').value,
    applied_on: document.getElementById('appAppliedOn').value || new Date().toISOString().split('T')[0],
    cover_letter: document.getElementById('appCoverLetter').value.trim() || null,
    resume_path: candidate.resume_path
  };

  const selectedSkills = Array.from(document.querySelectorAll('#skillsCheckboxContainer input[type="checkbox"]:checked'))
    .map(cb => parseInt(cb.value, 10));

  try {
    const res = await fetch('/api/candidate-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate, application, skills: selectedSkills })
    });
    const result = await res.json();

    if (result.error) {
      showToast(result.error, 'error');
    } else {
      showToast(result.message || 'Candidate and Application created successfully!', 'success');
      closeCandidateAppModal();
      
      // Refresh tables count & active table view
      await fetchTables();
      if (state.currentTable) {
        await loadTableSchema(state.currentTable);
        await loadTableData();
      }
    }
  } catch (err) {
    showToast('Submission failed: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i><span>Register & Create Application</span>';
    lucide.createIcons();
  }
}
// ==========================================
// CANDIDATE PROFILES
// ==========================================

async function loadCandidates() {
    try {
        const response = await fetch('/api/candidates');

        if (!response.ok) {
            throw new Error('Failed to load candidates');
        }

        const candidates = await response.json();

        const container = document.getElementById('candidateCards');

        if (!container) return;

        container.innerHTML = '';

        candidates.forEach(candidate => {
            const card = document.createElement('div');

            card.className = 'candidate-card';

            card.innerHTML = `
                <div class="person-icon">👤</div>

                <h3>${candidate.name}</h3>

                <p>Candidate ID: ${candidate.candidate_id}</p>

                <button onclick="showCandidate(${candidate.candidate_id})">
                    View Profile
                </button>
            `;

            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading candidates:', error);
    }
}


async function showCandidate(candidateId) {
    try {
        const response = await fetch(
            `/api/candidates/${candidateId}`
        );

        if (!response.ok) {
            throw new Error('Failed to load candidate');
        }

        const data = await response.json();

        const candidate = data.candidate;
        const skills = data.skills;

        document.getElementById('candidateName').textContent =
            candidate.name;

        document.getElementById('candidateEmail').textContent =
            `Email: ${candidate.email || 'Not available'}`;

        document.getElementById('candidatePhone').textContent =
            `Phone: ${candidate.phone || 'Not available'}`;

        const skillsContainer =
            document.getElementById('candidateSkills');

        skillsContainer.innerHTML = '';

        if (skills.length === 0) {
            skillsContainer.textContent = 'No skills listed.';
        } else {
            skills.forEach(skill => {

                const skillElement =
                    document.createElement('span');

                skillElement.className = 'skill-tag';

                skillElement.textContent =
                    `${skill.skill_name} - ${skill.proficiency_level || 'N/A'}`;

                skillsContainer.appendChild(skillElement);
            });
        }

        document.getElementById('candidateModal')
            .style.display = 'flex';

    } catch (error) {
        console.error('Error loading candidate:', error);
    }
}


// Close candidate profile
document.addEventListener('click', function(event) {

    if (event.target.id === 'closeModal') {
        document.getElementById('candidateModal')
            .style.display = 'none';
    }

});


// Load candidates when website starts
document.addEventListener('DOMContentLoaded', function() {
    loadCandidates();
});
