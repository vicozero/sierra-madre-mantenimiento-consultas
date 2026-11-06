/* ==============================================
   APLICACIÓN: Sierra Madre Modernización
   Frontend PWA - Mantenimiento Minero
   ============================================== */

function smEscapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function smSafeRow(row) {
    const safe={};
    for(const [key,value] of Object.entries(row))safe[key]=typeof value==='string'?smEscapeHTML(value):value;
    if('id' in safe)safe.id=Number.isFinite(Number(safe.id))?Number(safe.id):0;
    return safe;
}

document.addEventListener('DOMContentLoaded', function() {
    // Inicialización de variables
    let currentView = 'dashboard';
    let companyId = 'sierra_madre';
    let offline = false;
    let language = localStorage.getItem('sm_language') || 'es';
    let accessToken = '';
    let capabilities = null;
    
    // Elementos del DOM
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    const views = document.querySelectorAll('.section');
    const kpiStrip = document.querySelector('.kpi-strip');
    const topbar = document.querySelector('.topbar');
    
    // Idiomas soportados
    const supportedLanguages = [
        { code: 'es', name: 'Español', flag: '🇲🇽' },
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
    ];
    
    // Mostrar vista específica
    function showView(viewId) {
        views.forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.style.display = 'block';
            setTimeout(() => { targetView.classList.add('active'); }, 10);
        }
        currentView = viewId;
        updateActiveNav(viewId);
        loadViewData(viewId);
    }
    
    // Actualizar navegación activa
    function updateActiveNav(viewId) {
        document.querySelectorAll('.sidebar-nav a').forEach(link => {
            link.classList.remove('active');
            const icon = link.querySelector('.tab-icon');
            if (icon) icon.style.color = '#64748b';
        });
        const activeLink = document.querySelector(`.sidebar-nav a[data-view="${viewId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            const icon = activeLink.querySelector('.tab-icon');
            if (icon) icon.style.color = '#1e3a5f';
        }
    }
    
    // Mostrar notificación toast
    function showToast(message) {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // ============================================================
    // API Helper - Llamadas a la API real
    // ============================================================
    async function apiCall(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            cache: 'no-store',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(typeof errorData.detail === 'string' ? errorData.detail : `Error ${response.status}`);
        }
        return await response.json();
    }
    
    // ============================================================
    // Autenticación
    // ============================================================
    async function authenticate(token) {
        try {
            accessToken = token;
            const input=document.getElementById('accessToken');if(input)input.value='';
            const result = await apiCall('/api/v1/capabilities');
            capabilities = result;
            document.getElementById('accessStatus').textContent = 
                `Empresa: ${capabilities.company_id} · Perfil: ${capabilities.role}`;
            showToast('Acceso conectado.');
            return true;
        } catch (error) {
            accessToken = '';
            capabilities = null;
            showToast(error.message);
            return false;
        }
    }
    
    function logout() {
        accessToken = '';
        capabilities = null;
        document.getElementById('accessToken').value = '';
        document.getElementById('accessStatus').textContent = 'Sin autenticar';
        document.getElementById('equipmentForm').hidden = true;
        for(const id of ['equipmentTableBody','maintenanceTableBody','workordersTableBody','inventoryTableBody','kpiStrip','kpi-results']){const node=document.getElementById(id);if(node)node.replaceChildren();}
        document.querySelectorAll('form').forEach(form=>form.reset());
        showToast('Acceso cerrado.');
    }
    
    // ============================================================
    // Cargar datos de cada vista desde la API
    // ============================================================
    async function loadViewData(viewId) {
        if (!accessToken) return;
        
        try {
            switch (viewId) {
                case 'dashboard':
                    await loadDashboardData();
                    break;
                case 'equipment':
                    await loadEquipmentData();
                    break;
                case 'maintenance':
                    await loadMaintenanceData();
                    break;
                case 'workorders':
                    await loadWorkOrdersData();
                    break;
                case 'inventory':
                    await loadInventoryData();
                    break;
                case 'kpis':
                    await loadKPIData();
                    break;
            }
        } catch (error) {
            console.error('Error cargando vista:', error);
            showToast('Error al cargar datos.');
        }
    }
    
    async function loadDashboardData() {
        try {
            const summary = await apiCall('/api/v1/reports/kpi/summary');
            const trend = await apiCall('/api/v1/reports/availability/trend?months=6');
            
            // Actualizar KPIs del dashboard
            const cards = [
                { label: 'Disponibilidad', value: summary.promedio ? summary.promedio.toFixed(1) + '%' : '--', icon: '⛽', color: '#27ae60' },
                { label: 'Utilización', value: summary.promedio ? summary.promedio.toFixed(1) + '%' : '--', icon: '📊', color: '#3498db' },
                { label: 'Confiabilidad', value: summary.promedio ? summary.promedio.toFixed(1) + '%' : '--', icon: '🎯', color: '#8e44ad' },
                { label: 'Equipos', value: summary.equipos_analizados || '0', icon: '🏭', color: '#1e3a5f' }
            ];
            
            renderKPIStrip(cards);
        } catch (error) {
            // Si falla, mostrar placeholder
            renderKPIStrip([
                { label: 'Disponibilidad', value: '--', icon: '⛽', color: '#27ae60' },
                { label: 'Utilización', value: '--', icon: '📊', color: '#3498db' },
                { label: 'Confiabilidad', value: '--', icon: '🎯', color: '#8e44ad' },
                { label: 'Equipos', value: '--', icon: '🏭', color: '#1e3a5f' }
            ]);
        }
    }
    
    async function loadEquipmentData() {
        try {
            const data = await apiCall('/api/v1/equipment?limit=50&offset=0');
            renderEquipmentTable(data.items || []);
        } catch (error) {
            console.error('Error cargando equipos:', error);
        }
    }
    
    async function loadMaintenanceData() {
        try {
            const data = await apiCall('/api/v1/maintenance?limit=50&offset=0');
            renderMaintenanceTable(data.items || []);
        } catch (error) {
            console.error('Error cargando mantenimiento:', error);
        }
    }
    
    async function loadWorkOrdersData() {
        try {
            const data = await apiCall('/api/v1/workorders?limit=50&offset=0');
            renderWorkOrdersTable(data.items || []);
        } catch (error) {
            console.error('Error cargando OTs:', error);
        }
    }
    
    async function loadInventoryData() {
        try {
            const data = await apiCall('/api/v1/inventory?limit=50&offset=0');
            renderInventoryTable(data.items || []);
        } catch (error) {
            console.error('Error cargando inventario:', error);
        }
    }
    
    async function loadKPIData() {
        try {
            const trend = await apiCall('/api/v1/reports/availability/trend?months=12');
            const status = await apiCall('/api/v1/reports/equipment/status');
            renderKPICharts(trend, status);
        } catch (error) {
            console.error('Error cargando KPIs:', error);
        }
    }
    
    // ============================================================
    // Renderizado de tablas y KPIs
    // ============================================================
    function renderKPIStrip(cards) {
        if (!kpiStrip) return;
        kpiStrip.innerHTML = '';
        cards.forEach(card => {
            card = smSafeRow(card);
            const kpiCard = document.createElement('div');
            kpiCard.className = 'kpi-card';
            kpiCard.style.borderLeft = `4px solid ${card.color}`;
            kpiCard.innerHTML = `
                <span class="kpi-icon">${card.icon}</span>
                <div>
                    <span>${card.label}</span>
                    <strong>${card.value}</strong>
                </div>
            `;
            kpiStrip.appendChild(kpiCard);
        });
    }
    
    function renderEquipmentTable(equipments) {
        const tbody = document.getElementById('equipmentTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!equipments || equipments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No hay equipos registrados.</td></tr>';
            return;
        }
        equipments.forEach(eq => {
            eq = smSafeRow(eq);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${eq.code}</td>
                <td>${eq.description}</td>
                <td>${eq.family || '-'}</td>
                <td><button class="btn btn-small btn-secondary" onclick="editEquipment(${eq.id})">Editar</button></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    function renderMaintenanceTable(services) {
        const tbody = document.getElementById('maintenanceTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!services || services.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay servicios de mantenimiento registrados.</td></tr>';
            return;
        }
        services.forEach(svc => {
            svc = smSafeRow(svc);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${svc.service_name}</td>
                <td>${svc.equipment_id}</td>
                <td>${svc.service_type}</td>
                <td>${svc.scheduled_date || '-'}</td>
                <td><span class="status-badge ${svc.status.toLowerCase()}">${svc.status}</span></td>
                <td><button class="btn btn-small btn-secondary" onclick="editMaintenance(${svc.id})">Editar</button></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    function renderWorkOrdersTable(orders) {
        const tbody = document.getElementById('workordersTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!orders || orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No hay órdenes de trabajo registradas.</td></tr>';
            return;
        }
        orders.forEach(wo => {
            wo = smSafeRow(wo);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${wo.work_order_number}</td>
                <td>${wo.equipment_id}</td>
                <td>${wo.maintenance_type}</td>
                <td>${wo.priority}</td>
                <td>${wo.scheduled_date || '-'}</td>
                <td><span class="status-badge ${wo.status.toLowerCase()}">${wo.status}</span></td>
                <td><button class="btn btn-small btn-secondary" onclick="editWorkOrder(${wo.id})">Editar</button></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    function renderInventoryTable(items) {
        const tbody = document.getElementById('inventoryTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">No hay refacciones registradas.</td></tr>';
            return;
        }
        items.forEach(item => {
            item = smSafeRow(item);
            const tr = document.createElement('tr');
            const isCritical = item.stock <= (item.minimum || 0);
            tr.innerHTML = `
                <td>${item.part_number}</td>
                <td>${item.description}</td>
                <td>${item.unit}</td>
                <td>${item.stock}</td>
                <td>${item.minimum || '-'}</td>
                <td>${item.maximum || '-'}</td>
                <td><span class="${isCritical ? 'status-badge critical' : 'status-badge ok'}">${isCritical ? 'Crítico' : 'OK'}</span></td>
                <td><button class="btn btn-small btn-secondary" onclick="editInventory(${item.id})">Editar</button></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    function renderKPICharts(trend, status) {
        const resultsDiv = document.getElementById('kpi-results');
        if (!resultsDiv) return;
        
        let html = '<h3>Tendencia de Disponibilidad</h3>';
        if (trend && trend.length > 0) {
            html += '<table class="table-professional">';
            html += '<thead><tr><th>Mes</th><th>Disponibilidad %</th><th>Utilización %</th><th>Confiabilidad %</th><th>Equipos</th></tr></thead><tbody>';
            trend.forEach(t => {
            t = smSafeRow(t);
                html += `<tr><td>${t.mes}</td><td>${(t.disponibilidad_promedio || 0).toFixed(1)}</td><td>${(t.utilizacion_promedio || 0).toFixed(1)}</td><td>${(t.confiabilidad_promedio || 0).toFixed(1)}</td><td>${t.equipos_analizados}</td></tr>`;
            });
            html += '</tbody></table>';
        } else {
            html += '<p>No hay datos de tendencia disponibles.</p>';
        }
        
        html += '<h3>Estado de Equipos por Familia</h3>';
        if (status && status.length > 0) {
            html += '<table class="table-professional">';
            html += '<thead><tr><th>Familia</th><th>Total Equipos</th><th>Con KPI</th><th>Disponibilidad %</th></tr></thead><tbody>';
            status.forEach(s => {
            s = smSafeRow(s);
                html += `<tr><td>${s.familia}</td><td>${s.total_equipos}</td><td>${s.equipos_con_kpi}</td><td>${(s.disponibilidad_promedio || 0).toFixed(1)}</td></tr>`;
            });
            html += '</tbody></table>';
        } else {
            html += '<p>No hay datos de estado de equipos.</p>';
        }
        
        resultsDiv.innerHTML = html;
    }
    
    // ============================================================
    // Funciones de edición (placeholders)
    // ============================================================
    window.editEquipment = function(id) {
        showToast('Edición de equipo ' + id + ' - funcionalidad en desarrollo.');
    };
    window.editMaintenance = function(id) {
        showToast('Edición de mantenimiento ' + id + ' - funcionalidad en desarrollo.');
    };
    window.editWorkOrder = function(id) {
        showToast('Edición de OT ' + id + ' - funcionalidad en desarrollo.');
    };
    window.editInventory = function(id) {
        showToast('Edición de refacción ' + id + ' - funcionalidad en desarrollo.');
    };
    
    // ============================================================
    // Language selector
    // ============================================================
    function languageSelector() {
        const html = `
            <div class="language-selector" style="position: absolute; right: 150px; top: 50%; transform: translateY(-50%);">
                ${supportedLanguages.map((l, idx) => `
                    <span onclick="SM.changeLanguage('${l.code}')" class="lang-option ${language === l.code ? 'active' : ''}" title="${l.name}">
                        <span>${l.flag} ${l.code.toUpperCase()}</span>
                    </span>
                `).join('')}
            </div>
        `;
        const menuToggle = document.querySelector('.menu-toggle');
        if (menuToggle) {
            menuToggle.insertAdjacentHTML('afterend', html);
        } else {
            const brand = topbar.querySelector('.brand');
            if (brand) brand.insertAdjacentHTML('afterend', html);
        }
    }
    
    window.SM = window.SM || {};
    SM.changeLanguage = function(langCode) {
        const supported = ['es', 'en', 'fr', 'de'];
        if (!supported.includes(langCode)) return;
        language = langCode;
        localStorage.setItem('sm_language', language);
        document.querySelectorAll('.lang-option').forEach((opt, idx) => {
            opt.className = 'lang-option';
            if (supported[idx] === langCode) opt.classList.add('active');
        });
        showToast('Idioma cambiado a ' + supportedLanguages.find(l => l.code === langCode).name);
    };
    
    // ============================================================
    // Inicialización
    // ============================================================
    document.getElementById('accessForm').onsubmit = async function(e) {
        e.preventDefault();
        const token = document.getElementById('accessToken').value;
        const success = await authenticate(token);
        if (success) {
            document.getElementById('equipmentForm').hidden = !(capabilities.role === 'editor' && capabilities.writes_enabled);
            showView(currentView);
        }
    };
    
    document.getElementById('logout').onclick = logout;
    
    // Navegación sidebar
    document.querySelectorAll('.audit-sidebar nav button[data-view]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const view = this.getAttribute('data-view');
            if (view) showView(view);
        });
    });
    
    // Sidebar toggle móvil
    const menuBtn = document.querySelector('.menu-toggle');
    if (menuBtn) {
        menuBtn.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    
    // Inicializar
    languageSelector();
    showView('dashboard');
    
    // Exportar API global
    window.SM = {
        showView,
        currentView,
        setCompanyId: function(id) { companyId = id; },
        getCompanyId: function() { return companyId; },
        getLanguage: function() { return language; },
        changeLanguage: SM.changeLanguage,
        authenticate,
        logout
    };

// ============ PILOTO OPERATIVO: Programación de Servicios en Ensayo ============

const OPERATION_STATUS = {
    IDEAL: 'idle',
    LOCAL: 'local',
    PENDIENTE: 'pending',
    APLICADO: 'applied',
    RECHAZADO: 'rejected',
    CONFLICTO: 'conflict'
};

// UUID generator using crypto or fallback
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return r.toString(16);
    });
}

// Contexto de pilot operativo por usuario
let pilotContext = {
    userId: null,
    deviceId: null,
    currentOperation: null,
    pendingOperations: new Map() // key: uuid, value: operation data
};

// Inicializar pilot context desde localStorage o valores por defecto
function initPilotContext(userId, deviceId) {
    pilotContext.userId = userId;
    pilotContext.deviceId = deviceId || 'web-' + Date.now();
    pilotContext.pendingOperations = new Map();
}

// Guardar operación localmente (sin confirmación del servidor)
function saveOperationLocal(operationData) {
    const uuid = generateUUID();
    operationData.uuid = uuid;
    operationData.userId = pilotContext.userId;
    operationData.deviceId = pilotContext.deviceId;
    operationData.status = OPERATION_STATUS.LOCAL;
    operationData.createdAt = new Date().toISOString();
    operationData.version = 1;
    
    // Guardar en contexto y localStorage
    pilotContext.pendingOperations.set(uuid, operationData);
    localStorage.setItem('pilot_op_' + uuid, JSON.stringify(operationData));
    
    return uuid;
}

// Enviar operación pendiente al servidor
async function sendOperationToServer(operationData, apiEndpoint) {
    const uuid = operationData.uuid;
    
    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + pilotContext.accessToken
            },
            body: JSON.stringify(operationData)
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Marcar como aplicado en contexto local
            pilotContext.pendingOperations.set(uuid, {
                ...operationData,
                status: OPERATION_STATUS.APLICADO,
                serverId: result.serverId,
                appliedAt: new Date().toISOString()
            });
            
            // Remover de localStorage
            localStorage.removeItem('pilot_op_' + uuid);
            
            return { success: true, data: result };
        } else {
            // Servidor rechazó la operación
            pilotContext.pendingOperations.set(uuid, {
                ...operationData,
                status: OPERATION_STATUS.RECHAZADO,
                error: await response.text(),
                rejectedAt: new Date().toISOString()
            });
            return { success: false, error: 'Servidor rechazó la operación' };
        }
    } catch (error) {
        // Error de red - marcar como pendiente para reintento
        pilotContext.pendingOperations.set(uuid, {
            ...operationData,
            status: OPERATION_STATUS.LOCAL,
            error: error.message,
            retryCount: (pilotContext.pendingOperations.get(uuid)?.retryCount || 0) + 1
        });
        return { success: false, error: error.message };
    }
}

// Reintentar operación fallida
function retryOperation(uuid) {
    const operation = pilotContext.pendingOperations.get(uuid);
    if (!operation) return { success: false, error: 'Operación no encontrada' };
    
    if (operation.retryCount >= 3) {
        pilotContext.pendingOperations.set(uuid, {
            ...operation,
            status: OPERATION_STATUS.RECHAZADO,
            error: 'Máximo de reintentos alcanzados (3)'
        });
        return { success: false, error: 'Máximo de reintentos alcanzados' };
    }
    
    // Actualizar retry count y mantener status LOCAL
    operation.retryCount = (operation.retryCount || 0) + 1;
    pilotContext.pendingOperations.set(uuid, operation);
    
    return { success: true, operation };
}

// Obtener todas las operaciones pendientes
function getPendingOperations() {
    return Array.from(pilotContext.pendingOperations.values());
}

// Obtener una operación específica por UUID
function getOperation(uuid) {
    return pilotContext.pendingOperations.get(uuid) || localStorage.getItem('pilot_op_' + uuid);
}

// Cancelar operación pendiente
function cancelOperation(uuid) {
    pilotContext.pendingOperations.delete(uuid);
    localStorage.removeItem('pilot_op_' + uuid);
    return { success: true };
}

// Marcar operación como aplicada después de confirmación del servidor
function markOperationApplied(uuid, serverData) {
    const operation = pilotContext.pendingOperations.get(uuid);
    if (!operation) {
        const lsData = localStorage.getItem('pilot_op_' + uuid);
        if (lsData) {
            pilotContext.pendingOperations.set(uuid, JSON.parse(lsData));
        } else {
            return { success: false, error: 'Operación no encontrada' };
        }
    }
    
    pilotContext.pendingOperations.set(uuid, {
        ...operation,
        status: OPERATION_STATUS.APLICADO,
        appliedAt: new Date().toISOString(),
        serverData: serverData
    });
    
    localStorage.removeItem('pilot_op_' + uuid);
    return { success: true };
}

// Crear programación manual
async function createManualProgramming(serviceData, apiEndpoint) {
    // 1. Guardar localmente primero
    const uuid = saveOperationLocal({
        type: 'create_manual_programming',
        serviceData: serviceData,
        timestamp: new Date().toISOString()
    });
    
    // 2. Enviar al servidor
    const result = await sendOperationToServer({
        uuid,
        type: 'create_manual_programming',
        serviceData: serviceData,
        timestamp: new Date().toISOString(),
        userId: pilotContext.userId,
        deviceId: pilotContext.deviceId
    }, apiEndpoint);
    
    // 3. Marcar como aplicada si fue exitoso
    if (result.success) {
        markOperationApplied(uuid, result.data);
    }
    
    return { localUuid: uuid, serverResult: result };
}

// Cambiar fecha de un servicio
async function reprogramService(uuid, newDate, apiEndpoint) {
    // 1. Obtener operación actual
    const operation = getOperation(uuid);
    if (!operation) return { success: false, error: 'Operación no encontrada' };
    
    // 2. Actualizar datos con nueva fecha
    const updatedData = {
        ...operation.serviceData,
        scheduledDate: newDate,
        operationType: 'reprogram',
        timestamp: new Date().toISOString()
    };
    
    // 3. Guardar localmente
    const newUuid = saveOperationLocal({
        type: 'reprogram_service',
        serviceData: updatedData,
        originalUuid: uuid,
        timestamp: new Date().toISOString()
    });
    
    // 4. Enviar al servidor
    const result = await sendOperationToServer({
        ...operation,
        newUuid,
        type: 'reprogram_service',
        serviceData: updatedData,
        timestamp: new Date().toISOString()
    }, apiEndpoint);
    
    // 5. Marcar como aplicada si fue exitoso
    if (result.success) {
        markOperationApplied(newUuid, result.data);
    }
    
    return { localUuid: newUuid, serverResult: result };
}

// Registrar observaciones
async function registerObservations(uuid, observations, apiEndpoint) {
    // 1. Obtener operación
    const operation = getOperation(uuid);
    if (!operation) return { success: false, error: 'Operación no encontrada' };
    
    // 2. Actualizar servicio data con observaciones
    const updatedData = {
        ...operation.serviceData,
        observations: observations,
        operationType: 'add_observations',
        timestamp: new Date().toISOString()
    };
    
    // 3. Guardar localmente
    const newUuid = saveOperationLocal({
        type: 'register_observations',
        serviceData: updatedData,
        originalUuid: uuid,
        timestamp: new Date().toISOString()
    });
    
    // 4. Enviar al servidor
    const result = await sendOperationToServer({
        ...operation,
        newUuid,
        type: 'register_observations',
        serviceData: updatedData,
        timestamp: new Date().toISOString()
    }, apiEndpoint);
    
    // 5. Marcar como aplicada si fue exitoso
    if (result.success) {
        markOperationApplied(newUuid, result.data);
    }
    
    return { localUuid: newUuid, serverResult: result };
}

// Exportar funciones para uso global
window.SM = window.SM || {};
SM.pilot = {
    init: initPilotContext,
    saveOperationLocal,
    sendOperationToServer,
    retryOperation,
    getPendingOperations,
    getOperation,
    cancelOperation,
    markOperationApplied,
    createManualProgramming,
    reprogramService,
    registerObservations
};

// Calendar classification groups
const CALENDAR_GROUPS = { VL: 'VL', JL: 'JL', SUPERFICIE: 'Superficie', MINA: 'Mina' };

/* ----------
   CLASSIFICATION RULES (order of precedence)
   ------------------------
   1. family field from equipment catalog (normalized)
   2. equipment code normalized patterns
   3. Default: Mina (unclassified services)
   
   Family mapping:
   - VEHICULOSLIGEROS / VL- codes → VL (Vehículos Ligeros)
   - Perforadora/perforation-related families → JL (Máquinas Perforadoras)
   - Superficie-related families → Superficie
   - Everything else → Mina (with identification as pending classification)
*/

function normalizeFamily(family) {
  if (!family) return '';
  return String(family)
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/['´`]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeCode(code) {
  if (!code) return '';
  return String(code)
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/['´`]/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '');
}

// Classify a calendar row into one of the 4 groups
// Returns the group key (VL, JL, SUPERFICIE, MINA)
function classifyCalendarRow(row) {
  // Priority 1: Use the family field from the row (equipment catalog)
  const family = normalizeFamily(row.family);
  if (family) {
    // VL: Vehículos ligeros
    if (
      family === 'VEHICULOSLIGEROS' ||
      /VEHICULO(LIGER)?/.test(family) ||
      /^VL-/.test(normalizeCode(row.equipment))
    ) {
      return CALENDAR_GROUPS.VL;
    }
    // JL: Máquinas perforadoras - families related to perforación/drilling
    if (
      /PERFORADOR|PERFOR|BOOM|VIGA|ARRAC|STOPE/.test(family) ||
      /PERFORADOR|PERFOR/.test(normalizeCode(row.equipment))
    ) {
      return CALENDAR_GROUPS.JL;
    }
    // Superficie: families related to surface equipment
    if (
      /SUPERFICIE|SUPERFICI/.test(family) ||
      /PLANTA.BENEFICIO|BENEFICIO/.test(family) ||
      /PROYECTO|PROYECT/.test(family)
    ) {
      return CALENDAR_GROUPS.SUPERFICIE;
    }
  }

  // Priority 2: Use equipment code normalized patterns
  const eqCode = normalizeCode(row.equipment);
  if (eqCode) {
    // VL check via VL- prefix
    if (/^VL-/.test(eqCode)) return CALENDAR_GROUPS.VL;
    
    // JL: perforadora-related codes
    if (
      /PERFOR|PERF|ARRAC|BOOM|MC-|PM-/.test(eqCode) ||
      /PERFOR|PERF|ARRAC|BOOM/.test(eqCode)
    ) {
      return CALENDAR_GROUPS.JL;
    }
    
    // Superficie codes
    if (/SUR-|SUP-|PLT|BENEFICIO/.test(eqCode) || /SUPERFICIE/.test(eqCode)) {
      return CALENDAR_GROUPS.SUPERFICIE;
    }
  }

  // Priority 3: Check service name/type as secondary reference (not primary)
  const service = String(row.service || row.type || '').toUpperCase();

  // Default: Mina (unclassified - identified as pending classification)
  return CALENDAR_GROUPS.MINA;
}

// Classify all calendar rows into the 4 groups
function classifyCalendarData() {
  const classified = {
    VL: [],
    JL: [],
    SUPERFICIE: [],
    MINA: []
  };

  if (!data.calendar || !Array.isArray(data.calendar)) {
    return classified;
  }

  for (const row of data.calendar) {
    const group = classifyCalendarRow(row);
    if (classified[group]) {
      classified[group].push(row);
    } else {
      classified.MINA.push(row);
    }
  }

  return classified;
}

// Get calendar rows for a specific group
function calendarRowsForGroup(groupKey) {
  const classified = classifyCalendarData();
  return classified[groupKey] || [];
}

// Get the count of services in each group
function calendarGroupCounts() {
  const classified = classifyCalendarData();
  return {
    VL: classified.VL.length,
    JL: classified.JL.length,
    SUPERFICIE: classified.SUPERFICIE.length,
    MINA: classified.MINA.length,
    TOTAL: data.calendar ? data.calendar.length : 0
  };
}

// Validate that classification is complete (no duplicates, total matches)
function validateCalendarClassification() {
  const classified = classifyCalendarData();
  const totalClassified = classified.VL.length + classified.JL.length + classified.SUPERFICIE.length + classified.MINA.length;
  const isValid = totalClassified === (data.calendar ? data.calendar.length : 0);
  const noDuplicates = new Set([
    ...classified.VL,
    ...classified.JL,
    ...classified.SUPERFICIE,
    ...classified.MINA
  ]).size === totalClassified;
  
  return {
    valid: isValid,
    totalClassified,
    totalOriginal: data.calendar ? data.calendar.length : 0,
    noDuplicates,
    classified
  };
}

// Export the classified data for use in views
function getGroupedCalendars() {
  return classifyCalendarData();
}
});