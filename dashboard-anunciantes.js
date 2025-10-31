// js/dashboard-anunciantes.js

import { firestore } from './firebase-config.js';
import { collection, doc, getDocs, updateDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---
const tableBody = document.getElementById('user-campaigns-table-body');
const filterButtons = document.getElementById('user-campaigns-filter-buttons');

let allCampaigns = [];
let currentFilter = 'todos';

/**
 * Formata um valor monetário para o padrão BRL.
 * @param {number} value - O valor a ser formatado.
 * @returns {string} - A string formatada (ex: "R$ 50,00").
 */
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

/**
 * Capitaliza a primeira letra de uma string.
 * @param {string} s - A string de entrada.
 * @returns {string} - A string com a primeira letra maiúscula.
 */
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

/**
 * Renderiza as campanhas na tabela, aplicando o filtro atual.
 */
const renderCampaigns = () => {
    if (!tableBody) return;

    const filteredCampaigns = allCampaigns.filter(campaign => {
        if (currentFilter === 'todos') return true;
        return campaign.status === currentFilter;
    });

    tableBody.innerHTML = '';

    if (filteredCampaigns.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Nenhuma campanha encontrada para este filtro.</td></tr>`;
        return;
    }

    filteredCampaigns.forEach(campaign => {
        const tr = document.createElement('tr');
        tr.dataset.id = campaign.id;
        tr.dataset.status = campaign.status;

        tr.innerHTML = `
            <td>
                <strong>${campaign.nome || 'Sem Título'}</strong>
                <small>${campaign.descricao || ''}</small>
            </td>
            <td>
                <a href="${campaign.imagemUrl}" target="_blank" title="Ver imagem em nova aba">
                    <img src="${campaign.imagemUrl}" alt="Preview" class="table-media-preview">
                </a>
            </td>
            <td>${formatCurrency(campaign.budget)}</td>
            <td>
                <span class="status-badge status-${campaign.status}">${capitalize(campaign.status)}</span>
            </td>
            <td class="actions-cell">
                <select class="form-control-sm status-select">
                    <option value="pendente" ${campaign.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="ativo" ${campaign.status === 'ativo' ? 'selected' : ''}>Ativar</option>
                    <option value="pausado" ${campaign.status === 'pausado' ? 'selected' : ''}>Pausar</option>
                    <option value="reprovado" ${campaign.status === 'reprovado' ? 'selected' : ''}>Reprovar</option>
                </select>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

/**
 * Atualiza o status de uma campanha no Firestore.
 * @param {string} id - O ID do documento da campanha.
 * @param {string} newStatus - O novo status a ser aplicado.
 */
const updateCampaignStatus = async (id, newStatus) => {
    const campaignRef = doc(firestore, 'anunciosUsuarios', id);
    try {
        await updateDoc(campaignRef, { status: newStatus });
        console.log(`Campanha ${id} atualizada para ${newStatus}`);
        // A atualização na UI ocorrerá automaticamente pelo onSnapshot.
    } catch (error) {
        console.error("Erro ao atualizar status da campanha:", error);
        alert("Falha ao atualizar o status. Tente novamente.");
    }
};

/**
 * Função de inicialização do módulo.
 */
export function init() {
    console.log("Módulo de Campanhas de Usuários inicializado.");

    // Listener para os botões de filtro
    filterButtons.addEventListener('click', (e) => {
        if (e.target.matches('.filter-btn')) {
            filterButtons.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            currentFilter = e.target.dataset.status;
            renderCampaigns();
        }
    });

    // Delegação de evento para os seletores de status
    tableBody.addEventListener('change', (e) => {
        if (e.target.matches('.status-select')) {
            const campaignId = e.target.closest('tr').dataset.id;
            const newStatus = e.target.value;
            updateCampaignStatus(campaignId, newStatus);
        }
    });

    // Listener em tempo real para a coleção de campanhas
    const q = query(collection(firestore, 'anunciosUsuarios'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        allCampaigns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCampaigns();
    }, (error) => {
        console.error("Erro ao buscar campanhas de usuários:", error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" class="error-message">Falha ao carregar as campanhas.</td></tr>`;
        }
    });
}