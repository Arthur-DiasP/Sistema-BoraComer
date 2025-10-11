// js/dashboard-motoboy.js

import { firestore } from './firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---
const ordersGrid = document.getElementById('motoboy-orders-grid');
const filterButtonsContainer = document.getElementById('motoboy-filter-buttons');

// --- SELETORES DO MODAL DE ROTAS (MAPS) ---
const mapsModalOverlay = document.getElementById('maps-modal-overlay');
const mapsModalAddress = document.getElementById('maps-modal-address');
const googleMapsLink = document.getElementById('google-maps-link');
const wazeLink = document.getElementById('waze-link');
const closeModalBtn = document.getElementById('close-maps-modal-btn');

// --- ESTADO DO MÓDULO ---
let allOrdersToday = [];

/**
 * Abre o modal com os links para Google Maps e Waze.
 * @param {object} address - O objeto de endereço do pedido.
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
 * Renderiza os cards de pedidos com base no filtro ativo.
 */
function renderFilteredOrders() {
    const activeFilter = filterButtonsContainer.querySelector('.filter-btn.active').dataset.status;
    const completedOrders = allOrdersToday.filter(order => order.status === 'Concluído');
    let ordersToRender;

    if (activeFilter === 'pendente') {
        ordersToRender = completedOrders.filter(order => order.statusEntrega !== 'chegou');
    } else { // 'feita'
        ordersToRender = completedOrders.filter(order => order.statusEntrega === 'chegou');
    }
    
    ordersToRender.sort((a, b) => b.data.toMillis() - a.data.toMillis());

    if (ordersToRender.length === 0) {
        ordersGrid.innerHTML = activeFilter === 'pendente' ? 
            `<p>Nenhum pedido aguardando entrega no momento. Bom trabalho!</p>` : 
            `<p>Nenhuma entrega foi finalizada hoje ainda.</p>`;
        return;
    }

    ordersGrid.innerHTML = '';
    ordersToRender.forEach(order => {
        const phone = order.cliente.telefone ? order.cliente.telefone.replace(/\D/g, '') : '';
        
        // =================================================================================
        // ATUALIZAÇÃO DA MENSAGEM DO WHATSAPP APLICADA AQUI
        // =================================================================================
        const whatsappLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent('Olá! Sou o entregador da Pizzaria Moraes e seu pedido já chegou.')}` : '#';

        const itemsList = Object.values(order.itens).map(item => `<li>${item.quantidade}x ${item.nome}</li>`).join('');

        const card = document.createElement('div');
        card.className = 'motoboy-card';
        card.dataset.orderId = order.id;

        let actionsHtml;

        if (activeFilter === 'pendente') {
            actionsHtml = `
                <div class="motoboy-card-actions">
                    <a href="${whatsappLink}" target="_blank" class="whatsapp-btn" title="Contatar Cliente" ${!phone ? 'disabled' : ''}>
                        <i class="material-icons">chat</i>
                    </a>
                    <button class="confirm-delivery-btn" title="Confirmar Entrega">
                        <i class="material-icons">check_circle</i>
                        <span>Entregue</span>
                    </button>
                </div>`;
        } else { // Filtro 'feita'
            card.classList.add('delivery-dispatched');
            actionsHtml = `
                 <div class="motoboy-card-actions">
                    <button class="revert-btn" title="Mover para Pendentes">
                        <i class="material-icons">undo</i>
                        <span>Reverter</span>
                    </button>
                </div>`;
        }

        card.innerHTML = `
            <div class="motoboy-card-header">
                <h4>${order.cliente.nome}</h4>
                <span class="motoboy-card-total">R$ ${order.total.toFixed(2).replace('.', ',')}</span>
            </div>
            <div class="motoboy-card-body">
                <p class="motoboy-card-address" title="Clique para ver no mapa">
                    <i class="material-icons">place</i>
                    <span>${order.endereco.rua}, ${order.endereco.numero} - ${order.endereco.bairro}</span>
                </p>
                <p class="motoboy-card-items-title"><strong>Itens:</strong></p>
                <ul>${itemsList}</ul>
            </div>
            <div class="motoboy-card-footer">
                ${actionsHtml}
            </div>
        `;
        ordersGrid.appendChild(card);
    });
}

/**
 * Marca um pedido como "chegou" no Firestore.
 */
async function markAsArrived(orderId) {
    if (!orderId || !confirm("Confirmar que este pedido foi entregue ao cliente?")) return;
    
    const orderRef = doc(firestore, 'pedidos', orderId);
    try {
        await updateDoc(orderRef, { statusEntrega: 'chegou' });
    } catch (error) {
        console.error("Erro ao marcar pedido como entregue:", error);
        alert("Falha ao atualizar o status do pedido.");
    }
}

/**
 * Reverte o status de entrega de um pedido.
 */
async function revertDeliveryStatus(orderId) {
    if (!orderId || !confirm("Tem certeza que deseja mover este pedido de volta para 'Pendentes'?")) return;

    const orderRef = doc(firestore, 'pedidos', orderId);
    try {
        await updateDoc(orderRef, {
            statusEntrega: deleteField()
        });
    } catch (error) {
        console.error("Erro ao reverter status da entrega:", error);
        alert("Falha ao reverter o status.");
    }
}

export function init() {
    // Listeners do modal de mapas
    closeModalBtn.addEventListener('click', () => mapsModalOverlay.classList.remove('visible'));
    mapsModalOverlay.addEventListener('click', (e) => {
        if (e.target === mapsModalOverlay) {
            mapsModalOverlay.classList.remove('visible');
        }
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayTimestamp = Timestamp.fromDate(startOfToday);

    const q = query(
        collection(firestore, "pedidos"),
        where("data", ">=", startOfTodayTimestamp)
    );

    onSnapshot(q, (snapshot) => {
        allOrdersToday = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFilteredOrders();
    }, (error) => {
        console.error("Erro ao buscar pedidos do dia:", error);
        ordersGrid.innerHTML = '<p class="error-message">Falha ao carregar os pedidos.</p>';
    });

    filterButtonsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            filterButtonsContainer.querySelector('.filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            renderFilteredOrders();
        }
    });

    // Listener de eventos principal para os cards
    ordersGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.motoboy-card');
        if (!card) return;
        const orderId = card.dataset.orderId;

        // Ação: Clicar no endereço para abrir o mapa
        if (e.target.closest('.motoboy-card-address')) {
            const order = allOrdersToday.find(o => o.id === orderId);
            if (order && order.endereco) openMapsModal(order.endereco);
        }

        // Ação: Clicar no botão de confirmar entrega
        if (e.target.closest('.confirm-delivery-btn')) {
            markAsArrived(orderId);
        }
        
        // Ação: Clicar no botão de reverter entrega
        if (e.target.closest('.revert-btn')) {
            revertDeliveryStatus(orderId);
        }
    });
}