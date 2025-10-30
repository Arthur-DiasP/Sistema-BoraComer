// js/dashboard-anunciantes.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tableBody = document.getElementById('user-campaigns-table-body');
const filterButtonsContainer = document.getElementById('user-campaigns-filter-buttons');
let allCampaigns = [];
let currentFilter = 'todos';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const getStatusInfo = (status) => {
    switch (status) {
        case 'ativo':
            return { text: 'Ativo', className: 'status-concluído' };
        case 'pendente':
            return { text: 'Pendente', className: 'status-pendente' };
        case 'pausado':
            return { text: 'Pausado', className: 'status-em-preparo' };
        case 'reprovado':
            return { text: 'Reprovado', className: 'status-cancelado' };
        default:
            return { text: status, className: '' };
    }
};

const renderTable = () => {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    const campaignsToRender = allCampaigns.filter(campaign => {
        if (currentFilter === 'todos') return true;
        // Garante que campanhas sem status sejam tratadas como 'pendente'
        const campaignStatus = campaign.status || 'pendente'; 
        return campaignStatus === currentFilter;
    });

    if (campaignsToRender.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma campanha de usuário encontrada.</td></tr>';
        return;
    }

    campaignsToRender.forEach(campaign => {
        const tr = document.createElement('tr');
        tr.dataset.id = campaign.id;

        const statusInfo = getStatusInfo(campaign.status || 'pendente');

        tr.innerHTML = `
            <td>
                <div class="campaign-info">
                    <strong>${campaign.nome || 'Sem nome'}</strong>
                    <small>${campaign.tipo || 'N/A'}</small>
                </div>
            </td>
            <td>
                <div class="media-links">
                    <a href="${campaign.imagemUrl}" target="_blank" title="Ver Imagem">Imagem</a>
                    ${campaign.videoUrl ? `<a href="${campaign.videoUrl}" target="_blank" title="Ver Vídeo">Vídeo</a>` : ''}
                </div>
            </td>
            <td>${formatCurrency(campaign.budget || 0)}</td>
            <td><span class="order-status ${statusInfo.className}">${statusInfo.text}</span></td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon approve-btn" title="Aprovar" ${campaign.status === 'ativo' ? 'disabled' : ''}><i class="material-icons">check_circle</i></button>
                    <button class="btn-icon pause-btn" title="Pausar" ${campaign.status !== 'ativo' ? 'disabled' : ''}><i class="material-icons">pause_circle</i></button>
                    <button class="btn-icon reject-btn" title="Reprovar" ${campaign.status === 'reprovado' ? 'disabled' : ''}><i class="material-icons">cancel</i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

const handleStatusChange = async (campaignId, newStatus) => {
    try {
        const campaignRef = doc(firestore, 'anunciosUsuarios', campaignId);
        await updateDoc(campaignRef, { status: newStatus });
        // A atualização da tabela será feita pelo onSnapshot
    } catch (error) {
        console.error(`Erro ao atualizar status para ${newStatus}:`, error);
        alert('Falha ao atualizar o status da campanha.');
    }
};

const addEventListeners = () => {
    if (!tableBody) return;
    tableBody.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const row = e.target.closest('tr');
        const campaignId = row.dataset.id;

        if (button.classList.contains('approve-btn')) {
            handleStatusChange(campaignId, 'ativo');
        } else if (button.classList.contains('pause-btn')) {
            handleStatusChange(campaignId, 'pausado');
        } else if (button.classList.contains('reject-btn')) {
            if (confirm('Tem certeza que deseja reprovar esta campanha?')) {
                handleStatusChange(campaignId, 'reprovado');
            }
        }
    });

    if (!filterButtonsContainer) return;
    filterButtonsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            filterButtonsContainer.querySelector('.filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            currentFilter = e.target.dataset.status;
            renderTable();
        }
    });
};

const listenToCampaigns = () => {
    const q = collection(firestore, 'anunciosUsuarios');
    onSnapshot(q, (querySnapshot) => {
        allCampaigns = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Ordena por data de criação, se houver, ou deixa como está
        allCampaigns.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        renderTable();
    }, (error) => {
        console.error("Erro ao buscar campanhas de usuários:", error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" class="error-message">Falha ao carregar campanhas.</td></tr>';
        }
    });
};

export function init() {
    if (!tableBody) {
        console.warn('Elemento #user-campaigns-table-body não encontrado. O módulo de campanhas de usuários não será inicializado.');
        return;
    }
    listenToCampaigns();
    addEventListeners();
}