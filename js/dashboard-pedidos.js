// js/dashboard-pedidos.js

import { firestore } from './firebase-config.js';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES GLOBAIS DO MÓDULO ---
const ordersListElement = document.getElementById('all-orders-list');
const filterButtonsContainer = document.getElementById('pedidos-filter-buttons');
const selectAllCheckbox = document.getElementById('select-all-orders-checkbox');
const deleteSelectedBtn = document.getElementById('delete-selected-orders-btn');

// Seletores do Modal de Exclusão
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const adminPasswordInput = document.getElementById('admin-password-input');
const passwordErrorMessage = document.getElementById('password-error-message');


// Seletores do Modal de Mapas
const mapsModalOverlay = document.getElementById('maps-modal-overlay');
const mapsModalAddress = document.getElementById('maps-modal-address');
const googleMapsLink = document.getElementById('google-maps-link');
const wazeLink = document.getElementById('waze-link');
const closeModalBtn = document.getElementById('close-maps-modal-btn');

// Seletores do Modal de Designação
const assignModal = document.getElementById('assign-motoboy-modal');
const closeAssignBtn = document.getElementById('close-assign-modal-btn');
const motoboySelect = document.getElementById('motoboy-select');
const confirmAssignBtn = document.getElementById('confirm-assign-btn');

// --- ESTADO GLOBAL DO MÓDULO ---
let allOrders = []; // Armazena todos os pedidos para filtragem rápida
let allMotoboys = []; // Armazena os entregadores cadastrados
let currentOrderToAssign = null; // Guarda o ID do pedido a ser designado
let selectedOrders = []; // Armazena os IDs dos pedidos selecionados para exclusão

/**
 * Carrega a lista de entregadores do Firestore para preencher o seletor no modal.
 */
async function loadMotoboys() {
    try {
        const motoboySnapshot = await getDocs(collection(firestore, "motoboys"));
        allMotoboys = motoboySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        motoboySelect.innerHTML = '<option value="">Selecione um entregador...</option>';
        allMotoboys.forEach(m => {
            motoboySelect.innerHTML += `<option value="${m.id}">${m.nome}</option>`;
        });
    } catch (error) {
        console.error("Erro ao carregar entregadores:", error);
        motoboySelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

/**
 * Abre o modal para designar um entregador a um pedido específico.
 * @param {string} orderId - O ID do pedido.
 */
function openAssignModal(orderId) {
    currentOrderToAssign = orderId;
    motoboySelect.value = ''; // Reseta o seletor
    assignModal.classList.add('visible');
}

/**
 * Atualiza o pedido no Firestore com o entregador selecionado.
 */
async function handleAssignMotoboy() {
    const motoboyId = motoboySelect.value;
    if (!motoboyId || !currentOrderToAssign) {
        alert("Por favor, selecione um entregador.");
        return;
    }

    const selectedMotoboy = allMotoboys.find(m => m.id === motoboyId);
    if (!selectedMotoboy) return;
    
    confirmAssignBtn.disabled = true;

    try {
        const orderRef = doc(firestore, "pedidos", currentOrderToAssign);
        await updateDoc(orderRef, {
            statusEntrega: 'a_caminho',
            motoboy: {
                id: selectedMotoboy.id,
                nome: selectedMotoboy.nome
            }
        });
        assignModal.classList.remove('visible');
    } catch (error) {
        console.error("Erro ao designar motoboy:", error);
        alert("Não foi possível designar o entregador. Tente novamente.");
    } finally {
        confirmAssignBtn.disabled = false;
    }
}

/**
 * Lida com a alteração do status de um pedido (Pendente, Concluído, Cancelado).
 */
async function handleStatusChange(event) {
    const target = event.target;
    if (target.classList.contains('status-selector')) {
        const orderCard = target.closest('.order-card');
        const orderId = orderCard.dataset.orderId;
        const newStatus = target.value;
        const feedbackEl = orderCard.querySelector('.status-saved-feedback');

        if (!orderId) return;

        try {
            const orderRef = doc(firestore, "pedidos", orderId);
            await updateDoc(orderRef, { status: newStatus });
            
            feedbackEl.textContent = 'Salvo!';
            feedbackEl.style.opacity = '1';
            setTimeout(() => { feedbackEl.style.opacity = '0'; }, 2000);
        } catch (error) {
            console.error("Erro ao atualizar o status do pedido:", error);
            feedbackEl.textContent = 'Erro!';
            feedbackEl.style.opacity = '1';
        }
    }
}

/**
 * Abre o modal de rotas (Google Maps/Waze).
 */
function openMapsModal(address) {
    const addressString = `${address.rua}, ${address.numero} - ${address.bairro}, ${address.cep}`;
    const encodedAddress = encodeURIComponent(addressString);
    mapsModalAddress.textContent = addressString;
    googleMapsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
    wazeLink.href = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
    mapsModalOverlay.classList.add('visible');
}

/**
 * Lida com cliques dentro de um card de pedido (expandir detalhes, abrir mapa, etc.).
 */
function handleOrderCardClick(event) {
    const target = event.target;
    const button = target.closest('.toggle-details-btn');
    const addressEl = target.closest('.address-clickable');
    
    if (button) {
        const details = button.nextElementSibling;
        const icon = button.querySelector('i');
        details.classList.toggle('hidden');
        button.classList.toggle('is-open');
        icon.textContent = details.classList.contains('hidden') ? 'expand_more' : 'expand_less';
    }
    if (addressEl) {
        const orderId = addressEl.closest('.order-card').dataset.orderId;
        const order = allOrders.find(o => o.id === orderId);
        if (order && order.endereco) {
            openMapsModal(order.endereco);
        }
    }
     if (event.target.closest('.assign-motoboy-btn')) {
        const orderId = event.target.closest('.order-card').dataset.orderId;
        openAssignModal(orderId);
    }
}

/**
 * Renderiza os pedidos filtrados na tela.
 */
function renderFilteredOrders(statusFilter) {
    ordersListElement.innerHTML = '';
    const filtered = allOrders.filter(order => statusFilter === 'todos' || order.status === statusFilter);

    if (filtered.length === 0) {
        ordersListElement.innerHTML = '<p>Nenhum pedido encontrado para este status.</p>';
        return;
    }

    filtered.forEach((pedido) => {
        const orderId = pedido.id;
        const pedidoCard = document.createElement('div');
        pedidoCard.className = 'order-card';
        pedidoCard.dataset.orderId = orderId;
        const date = pedido.data ? pedido.data.toDate() : new Date();
        const formattedDate = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR').substring(0, 5);
        const itemsListHtml = Object.values(pedido.itens || {}).map(item => `<li><strong>${item.quantidade}x ${item.nome}</strong></li>`).join('');

        // Lógica para o botão de designar
        let assignButtonHtml = '';
        if (pedido.status === 'Concluído' && !pedido.motoboy) {
            assignButtonHtml = `<button class="assign-motoboy-btn"><i class="material-icons">delivery_dining</i> Designar</button>`;
        } else if (pedido.motoboy) {
            let statusEntregaText = 'A caminho';
            if(pedido.statusEntrega === 'entregue') statusEntregaText = `Entregue (${pedido.formaPagamentoFinal})`;

            assignButtonHtml = `<div class="assigned-info">Entregador: <strong>${pedido.motoboy.nome}</strong> (${statusEntregaText})</div>`;
        }

        pedidoCard.innerHTML = `
            <div class="card-header">
                <div class="card-title">
                    <input type="checkbox" class="order-select-checkbox" data-order-id="${orderId}">
                    <span class="order-id">#${orderId.substring(0, 8)}</span>
                    <h4 class="client-name">${pedido.cliente?.nome || 'Cliente'}</h4>
                </div>
                <div class="card-status">
                    <select class="status-selector">
                        <option value="Pagamento Pendente" ${pedido.status === 'Pagamento Pendente' ? 'selected' : ''}>Pendente</option>
                        <option value="Concluído" ${pedido.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                        <option value="Cancelado" ${pedido.status === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
                    </select>
                    <span class="status-saved-feedback"></span>
                </div>
            </div>
            <div class="card-body">
                <p class="order-info"><strong>Total:</strong> R$ ${pedido.total ? pedido.total.toFixed(2).replace('.', ',') : '0,00'}</p>
                <p class="order-info"><strong>Data:</strong> ${formattedDate}</p>
                <p class="order-info address-clickable" title="Clique para ver no mapa"><strong>Endereço:</strong> ${pedido.endereco.rua}, ${pedido.endereco.numero}</p>
                <p class="order-info"><strong>Pagamento:</strong> ${pedido.formaPagamento || 'Não informado'}</p>
                <button class="toggle-details-btn"><i class="material-icons">expand_more</i> Ver Itens</button>
                <div class="order-items-details hidden">
                    <h4>Itens do Pedido:</h4>
                    <ul class="items-list">${itemsListHtml}</ul>
                </div>
            </div>
            <div class="card-footer-actions">
                ${assignButtonHtml}
            </div>
        `;
        ordersListElement.appendChild(pedidoCard);
    });
}

/**
 * Função principal de inicialização do módulo.
 */
export function init() {
    ordersListElement.innerHTML = '<p>Carregando histórico de pedidos...</p>';

    loadMotoboys();

    const q = query(collection(firestore, "pedidos"), orderBy("data", "desc"));

    onSnapshot(q, (snapshot) => {
        allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const currentFilter = filterButtonsContainer.querySelector('.active').dataset.status;
        renderFilteredOrders(currentFilter);
        
        updateDeleteButtonState();
    }, (error) => {
        console.error("Erro ao carregar pedidos em tempo real:", error);
        ordersListElement.innerHTML = '<p>Erro ao carregar histórico de pedidos. Verifique o console.</p>';
    });

    // Configura os event listeners uma única vez
    ordersListElement.addEventListener('change', handleStatusChange);
    ordersListElement.addEventListener('click', handleOrderCardClick);
    filterButtonsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            filterButtonsContainer.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            renderFilteredOrders(e.target.dataset.status);
        }
    });

    // Listeners dos modais
    closeModalBtn.addEventListener('click', () => mapsModalOverlay.classList.remove('visible'));
    mapsModalOverlay.addEventListener('click', (e) => {
        if(e.target === mapsModalOverlay) mapsModalOverlay.classList.remove('visible');
    });
    closeAssignBtn.addEventListener('click', () => assignModal.classList.remove('visible'));
    assignModal.addEventListener('click', (e) => {
        if(e.target === assignModal) assignModal.classList.remove('visible');
    });
    confirmAssignBtn.addEventListener('click', handleAssignMotoboy);

    /**
     * Atualiza o estado do botão de exclusão e do checkbox "Selecionar Todos".
     */
    function updateDeleteButtonState() {
        const checkboxes = ordersListElement.querySelectorAll('.order-select-checkbox');
        const checkedCount = selectedOrders.length;

        deleteSelectedBtn.disabled = checkedCount === 0;
        
        const icon = '<i class="material-icons">delete</i>';
        deleteSelectedBtn.innerHTML = checkedCount > 0 ? `${icon} Excluir ${checkedCount} Pedido(s)` : `${icon} Excluir Selecionados`;

        if (checkboxes.length > 0) {
            selectAllCheckbox.checked = checkedCount === checkboxes.length;
        } else {
            selectAllCheckbox.checked = false;
        }
    }

    /**
     * Lida com a seleção de um pedido individual.
     * @param {Event} event
     */
    function handleOrderSelection(event) {
        if (!event.target.classList.contains('order-select-checkbox')) return;

        const orderId = event.target.dataset.orderId;
        if (event.target.checked) {
            if (!selectedOrders.includes(orderId)) {
                selectedOrders.push(orderId);
            }
        } else {
            selectedOrders = selectedOrders.filter(id => id !== orderId);
        }
        updateDeleteButtonState();
    }

    /**
     * Lida com o clique no checkbox "Selecionar Todos".
     */
    function handleSelectAll() {
        const checkboxes = ordersListElement.querySelectorAll('.order-select-checkbox');
        selectedOrders = []; // Limpa a seleção atual

        if (selectAllCheckbox.checked) {
            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
                selectedOrders.push(checkbox.dataset.orderId);
            });
        } else {
            checkboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
        }
        updateDeleteButtonState();
    }

    /**
     * Gera um PDF com os pedidos selecionados e, em seguida, os exclui.
     */
    async function generatePdfAndDelete() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const ordersToDelete = allOrders.filter(order => selectedOrders.includes(order.id));

        const tableColumn = ["ID do Pedido", "Cliente", "Data", "Total", "Status"];
        const tableRows = [];

        ordersToDelete.forEach(order => {
            const orderData = [
                order.id.substring(0, 8),
                order.cliente?.nome || 'N/A',
                order.data ? order.data.toDate().toLocaleDateString('pt-BR') : 'N/A',
                `R$ ${order.total ? order.total.toFixed(2) : '0.00'}`,
                order.status || 'N/A'
            ];
            tableRows.push(orderData);
        });

        doc.autoTable(tableColumn, tableRows, { startY: 20 });
        doc.text("Relatório de Pedidos Excluídos", 14, 15);
        const date = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        doc.save(`pedidos-excluidos-${date}.pdf`);

        // Excluir os pedidos do Firestore
        const deletePromises = selectedOrders.map(orderId => deleteDoc(doc(firestore, "pedidos", orderId)));
        
        try {
            await Promise.all(deletePromises);
            alert(`${selectedOrders.length} pedido(s) excluído(s) com sucesso!`);
            selectedOrders = [];
            updateDeleteButtonState();
        } catch (error) {
            console.error("Erro ao excluir pedidos: ", error);
            alert("Ocorreu um erro ao excluir os pedidos. Verifique o console para mais detalhes.");
        }
    }

    /**
     * Verifica a senha do administrador e inicia o processo de exclusão.
     */
    function verifyPasswordAndGeneratePDF() {
        const password = adminPasswordInput.value;
        // ATENÇÃO: A senha está hardcoded. Em um ambiente de produção, use um método seguro de verificação.
        if (password === '111111') {
            passwordErrorMessage.style.display = 'none';
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.textContent = 'Processando...';

            generatePdfAndDelete().finally(() => {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.textContent = 'Confirmar e Excluir';
                closeModal();
            });

        } else {
            passwordErrorMessage.textContent = 'Senha incorreta.';
            passwordErrorMessage.style.display = 'block';
        }
    }
    
    const closeModal = () => {
        deleteConfirmModal.classList.remove('visible');
        adminPasswordInput.value = '';
        passwordErrorMessage.style.display = 'none';
    };

    // --- LISTENERS PARA EXCLUSÃO ---
    ordersListElement.addEventListener('click', handleOrderSelection);
    selectAllCheckbox.addEventListener('change', handleSelectAll);

    deleteSelectedBtn.addEventListener('click', () => {
        deleteConfirmModal.classList.add('visible');
    });

    closeDeleteModalBtn.addEventListener('click', closeModal);
    cancelDeleteBtn.addEventListener('click', closeModal);
    confirmDeleteBtn.addEventListener('click', verifyPasswordAndGeneratePDF);
}