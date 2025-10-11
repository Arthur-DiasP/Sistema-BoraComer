// js/dashboard-inicio.js

import { firestore } from './firebase-config.js';
import { collection, onSnapshot, query, orderBy, Timestamp, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- VARIÁVEIS E FUNÇÕES AUXILIARES ---
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PAYMENT_COLORS = {
    'Pix': '#4CAF50',
    'Dinheiro': '#2196F3',
    'Crédito': '#FFC107',
    'Débito': '#E91E63',
    'Outros': '#9E9E9E'
};

let monthlyRevenueChartInstance = null;
let paymentMethodsChartInstance = null;
let processedOrderData = {
    monthlyRevenue: Array(12).fill(0),
    paymentMethodsByMonth: {}
};
let allClients = []; // Armazena os dados dos clientes para edição rápida

// --- SELETORES DO DOM ---
const monthSelector = document.getElementById('month-selector');
const monthlyRevenueCanvas = document.getElementById('monthlyRevenueChart').getContext('2d');
const paymentMethodsCanvas = document.getElementById('paymentMethodsChart').getContext('2d');
const totalClientesCard = document.getElementById('card-total-clientes');

// --- SELETORES DO MODAL DE CLIENTES ---
const clientsModalOverlay = document.getElementById('clients-modal-overlay');
const closeClientsModalBtn = document.getElementById('close-clients-modal-btn');

// --- SELETORES DO ALERTA DE ESTOQUE ---
const lowStockAlertCard = document.getElementById('low-stock-alert-card');
const lowStockList = document.getElementById('low-stock-list');
const clientsListContainer = document.getElementById('clients-list-container');
const clientsListDiv = document.getElementById('clients-list');
const clientEditFormContainer = document.getElementById('client-edit-form-container');
const clientEditForm = document.getElementById('client-edit-form');
const cancelEditBtn = document.getElementById('cancel-edit-btn');


// --- LÓGICA DE GERENCIAMENTO DE CLIENTES ---

/**
 * Busca todos os usuários no Firestore e os renderiza na lista do modal.
 */
async function fetchAndRenderClients() {
    clientsListDiv.innerHTML = '<p>Carregando clientes...</p>';
    try {
        const usersCollection = collection(firestore, 'users');
        const querySnapshot = await getDocs(query(usersCollection, orderBy('nome')));
        
        allClients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        clientsListDiv.innerHTML = '';

        if (allClients.length === 0) {
            clientsListDiv.innerHTML = '<p>Nenhum cliente encontrado.</p>';
            return;
        }

        allClients.forEach(client => {
            const clientItem = document.createElement('div');
            clientItem.className = 'client-item';
            clientItem.dataset.id = client.id;

            clientItem.innerHTML = `
                <div class="client-info">
                    <div class="client-name">${client.nome}</div>
                    <div class="client-details">
                        <span><i class="material-icons" style="font-size: 1em; vertical-align: middle;">email</i> ${client.email}</span>
                        <span><i class="material-icons" style="font-size: 1em; vertical-align: middle;">phone</i> ${client.telefone || 'N/A'}</span>
                        <span><strong>CPF:</strong> ${client.cpf || 'N/A'}</span>
                    </div>
                </div>
                <div class="client-actions">
                    <button class="btn-icon edit-client-btn" title="Editar Cliente"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-client-btn" title="Excluir Cliente"><i class="material-icons">delete</i></button>
                </div>
            `;
            clientsListDiv.appendChild(clientItem);
        });
    } catch (error) {
        console.error("Erro ao buscar clientes:", error);
        clientsListDiv.innerHTML = '<p class="error-message">Falha ao carregar clientes.</p>';
    }
}

/**
 * Exibe o formulário de edição com os dados do cliente selecionado.
 * @param {string} clientId O ID do cliente a ser editado.
 */
function showEditForm(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;

    document.getElementById('edit-client-id').value = client.id;
    document.getElementById('edit-nome').value = client.nome;
    document.getElementById('edit-email').value = client.email;
    document.getElementById('edit-telefone').value = client.telefone || '';
    document.getElementById('edit-cpf').value = client.cpf || '';
    document.getElementById('edit-nascimento').value = client.dataNascimento || '';

    clientsListContainer.style.display = 'none';
    clientEditFormContainer.style.display = 'block';
}

/**
 * Exclui um cliente do Firestore após confirmação.
 * @param {string} clientId O ID do cliente a ser excluído.
 */
async function deleteClient(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;
    
    if (confirm(`Tem certeza que deseja excluir o cliente "${client.nome}"? Esta ação não pode ser desfeita.`)) {
        try {
            await deleteDoc(doc(firestore, "users", clientId));
            alert('Cliente excluído com sucesso!');
            fetchAndRenderClients();
        } catch (error) {
            console.error("Erro ao excluir cliente:", error);
            alert('Falha ao excluir cliente.');
        }
    }
}

/**
 * Salva as alterações do formulário de edição no Firestore.
 */
async function saveClientChanges(event) {
    event.preventDefault();
    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Salvando...';

    const clientId = document.getElementById('edit-client-id').value;
    const updatedData = {
        nome: document.getElementById('edit-nome').value,
        telefone: document.getElementById('edit-telefone').value,
        cpf: document.getElementById('edit-cpf').value,
        dataNascimento: document.getElementById('edit-nascimento').value,
    };

    try {
        await updateDoc(doc(firestore, "users", clientId), updatedData);
        alert('Cliente atualizado com sucesso!');
        clientEditFormContainer.style.display = 'none';
        clientsListContainer.style.display = 'block';
        fetchAndRenderClients();
    } catch (error) {
        console.error("Erro ao atualizar cliente:", error);
        alert('Falha ao salvar as alterações.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Salvar Alterações';
    }
}


// --- LÓGICA DE GRÁFICOS E RESUMO ---

function normalizePaymentMethod(method) {
    if (!method) return 'Outros';
    const lowerMethod = method.toLowerCase();
    if (lowerMethod.includes('pix')) return 'Pix';
    if (lowerMethod.includes('dinheiro')) return 'Dinheiro';
    if (lowerMethod.includes('crédito') || lowerMethod.includes('credit')) return 'Crédito';
    if (lowerMethod.includes('débito') || lowerMethod.includes('debit')) return 'Débito';
    return 'Outros';
}

function renderMonthlyRevenueChart(revenueData) {
    if (monthlyRevenueChartInstance) {
        monthlyRevenueChartInstance.destroy();
    }
    monthlyRevenueChartInstance = new Chart(monthlyRevenueCanvas, {
        type: 'bar',
        data: {
            labels: MONTHS,
            datasets: [{
                label: 'Faturamento',
                data: revenueData,
                backgroundColor: 'rgba(63, 81, 181, 0.7)',
                borderColor: 'rgba(63, 81, 181, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { callback: (value, index) => MONTHS[index].substring(0, 3) } },
                y: { beginAtZero: true, ticks: { stepSize: 250, callback: (value) => formatCurrency(value) } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { title: (context) => context[0].label, label: (context) => `Faturamento: ${formatCurrency(context.raw)}` } }
            }
        }
    });
}

function renderPaymentMethodsChart(paymentData) {
    if (paymentMethodsChartInstance) {
        paymentMethodsChartInstance.destroy();
    }
    const labels = Object.keys(paymentData);
    const data = Object.values(paymentData);
    const totalPedidos = data.reduce((sum, value) => sum + value, 0);
    paymentMethodsChartInstance = new Chart(paymentMethodsCanvas, {
        type: 'doughnut',
        data: {
            labels: labels.length > 0 ? labels : ['Nenhum dado'],
            datasets: [{
                label: 'Pedidos',
                data: data.length > 0 ? data : [1],
                backgroundColor: labels.length > 0 ? labels.map(label => PAYMENT_COLORS[label]) : ['#E0E0E0'],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            if (totalPedidos === 0) return `${label}: ${value}`;
                            const percentage = ((value / totalPedidos) * 100).toFixed(1);
                            return `${label}: ${value} pedidos (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

const listenToUsers = () => {
    onSnapshot(collection(firestore, 'users'), (snapshot) => {
        document.getElementById('total-clientes').textContent = snapshot.size;
    }, (error) => console.error("Erro ao escutar usuários:", error));
};

/**
 * Escuta por atualizações no estoque e exibe alertas para itens baixos.
 */
const listenToStockLevels = () => {
    const q = query(collection(firestore, "stock"));
    onSnapshot(q, (snapshot) => {
        const lowStockItems = [];
        snapshot.forEach(doc => {
            const item = doc.data();
            if (item.quantity <= item.threshold) {
                lowStockItems.push(item);
            }
        });

        if (lowStockItems.length > 0) {
            lowStockList.innerHTML = lowStockItems.map(item => `<li><strong>${item.name}:</strong> ${item.quantity} ${item.unit} restantes</li>`).join('');
            lowStockAlertCard.style.display = 'block';
        } else {
            lowStockAlertCard.style.display = 'none';
        }
    });
};

const listenToOrders = () => {
    const q = query(collection(firestore, 'pedidos'), orderBy('data', 'desc'));

    onSnapshot(q, (querySnapshot) => {
        let pedidosHoje = 0, faturamentoDia = 0, pedidosSemana = 0, faturamentoSemana = 0;
        const newMonthlyRevenue = Array(12).fill(0);
        const newPaymentMethodsByMonth = {};
        const currentYear = new Date().getFullYear();

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - hoje.getDay());

        querySnapshot.forEach((doc) => {
            const pedido = doc.data();
            if (!pedido.data) return;

            const dataPedido = pedido.data.toDate();
            
            // --- Processamento para os Cards de Resumo ---
            if (dataPedido >= hoje) {
                pedidosHoje++; 
                if (pedido.status === 'Concluído') {
                    faturamentoDia += pedido.total;
                }
            }
            if (dataPedido >= inicioSemana) {
                pedidosSemana++;
                if (pedido.status === 'Concluído') {
                    faturamentoSemana += pedido.total;
                }
            }

            // --- Processamento para os Gráficos (apenas ano atual e concluídos) ---
            if (pedido.status === 'Concluído' && dataPedido.getFullYear() === currentYear) {
                const month = dataPedido.getMonth();
                
                newMonthlyRevenue[month] += pedido.total;
                
                const paymentMethod = normalizePaymentMethod(pedido.formaPagamento);
                
                if (!newPaymentMethodsByMonth[month]) {
                    newPaymentMethodsByMonth[month] = {};
                }
                if (!newPaymentMethodsByMonth[month][paymentMethod]) {
                    newPaymentMethodsByMonth[month][paymentMethod] = 0;
                }
                newPaymentMethodsByMonth[month][paymentMethod]++;
            }
        });

        processedOrderData = { monthlyRevenue: newMonthlyRevenue, paymentMethodsByMonth: newPaymentMethodsByMonth };

        document.getElementById('pedidos-hoje').textContent = pedidosHoje;
        document.getElementById('faturamento-dia').textContent = formatCurrency(faturamentoDia);
        document.getElementById('pedidos-semana').textContent = pedidosSemana;
        document.getElementById('faturamento-semana').textContent = formatCurrency(faturamentoSemana);
        
        renderMonthlyRevenueChart(processedOrderData.monthlyRevenue);
        renderPaymentMethodsChart(processedOrderData.paymentMethodsByMonth[monthSelector.value] || {});

    }, (error) => console.error("Erro ao escutar pedidos:", error));
};

function setupMonthSelector() {
    monthSelector.innerHTML = '';
    const currentMonth = new Date().getMonth();
    MONTHS.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        if (index === currentMonth) {
            option.selected = true;
        }
        monthSelector.appendChild(option);
    });
    monthSelector.addEventListener('change', () => {
        const selectedMonth = monthSelector.value;
        renderPaymentMethodsChart(processedOrderData.paymentMethodsByMonth[selectedMonth] || {});
    });
}


/**
 * Função principal que inicializa a lógica da seção "Início".
 */
export function init() {
    document.querySelectorAll('.summary-text strong').forEach(el => el.textContent = '...');
    
    // Configura o card de clientes para ser clicável
    totalClientesCard.style.cursor = 'pointer';
    totalClientesCard.addEventListener('click', () => {
        clientsModalOverlay.classList.add('visible');
        fetchAndRenderClients();
    });

    // Eventos do modal de clientes
    closeClientsModalBtn.addEventListener('click', () => {
        clientsModalOverlay.classList.remove('visible');
        clientEditFormContainer.style.display = 'none';
        clientsListContainer.style.display = 'block';
    });
    clientsModalOverlay.addEventListener('click', (e) => {
        if (e.target === clientsModalOverlay) {
            clientsModalOverlay.classList.remove('visible');
            clientEditFormContainer.style.display = 'none';
            clientsListContainer.style.display = 'block';
        }
    });

    // Delegação de eventos para os botões de editar/excluir na lista
    clientsListDiv.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-client-btn');
        const deleteBtn = e.target.closest('.delete-client-btn');
        
        if (editBtn) {
            const clientId = editBtn.closest('.client-item').dataset.id;
            showEditForm(clientId);
        }
        if (deleteBtn) {
            const clientId = deleteBtn.closest('.client-item').dataset.id;
            deleteClient(clientId);
        }
    });

    // Eventos do formulário de edição
    clientEditForm.addEventListener('submit', saveClientChanges);
    cancelEditBtn.addEventListener('click', () => {
        clientEditFormContainer.style.display = 'none';
        clientsListContainer.style.display = 'block';
    });
    
    // Inicializa as outras funcionalidades da página
    setupMonthSelector();
    listenToUsers();
    listenToStockLevels();
    listenToOrders();
    
    document.getElementById('card-pedidos-hoje').addEventListener('click', () => {
        document.querySelector('.nav-link[data-target="pedidos"]')?.click();
    });
}