// js/dashboard-pedidos.js

import { firestore } from './firebase-config.js';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES GLOBAIS DO MÓDULO ---
const ordersListElement = document.getElementById('all-orders-list');
const filterButtonsContainer = document.getElementById('pedidos-filter-buttons');

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
    
    // Carrega a lista de entregadores para o modal
    loadMotoboys();
    
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

    // Inicia a escuta de pedidos em tempo real
    try {
        const q = query(collection(firestore, "pedidos"), orderBy("data", "desc"));
        
        onSnapshot(q, (querySnapshot) => {
            allOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const activeFilter = filterButtonsContainer.querySelector('.filter-btn.active').dataset.status;
            renderFilteredOrders(activeFilter);

        }, (error) => {
            console.error("Erro ao escutar mudanças nos pedidos:", error);
            ordersListElement.innerHTML = '<p>Erro ao carregar o histórico em tempo real.</p>';
        });

    } catch (error) {
        console.error("Erro ao configurar o listener de pedidos:", error);
        ordersListElement.innerHTML = '<p>Erro ao iniciar a busca por pedidos.</p>';
    }
}