// js/dashboard-cupom.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- SELETORES DO DOM ---

// Formulário e Tabela do Jogo (Cupom Mágico)
const gameForm = document.getElementById('cupom-campaign-form');
const gameFormTitle = document.getElementById('cupom-form-title');
const gameCampaignIdInput = document.getElementById('campaign-id');
const gameClearFormBtn = document.getElementById('clear-campaign-form-btn');
const gameTableBody = document.getElementById('campaigns-table-body');

// Seletores para Cupons Promocionais
const promoForm = document.getElementById('promo-cupom-form');
const promoFormTitle = document.getElementById('promo-cupom-form-title');
const promoCampaignIdInput = document.getElementById('promo-cupom-id');
const promoCodeInput = document.getElementById('promo-cupom-code');
const promoTypeSelect = document.getElementById('promo-cupom-type');
const promoDiscountGroup = document.getElementById('promo-cupom-discount-group');
const promoDiscountInput = document.getElementById('promo-cupom-discount');
const promoLimitInput = document.getElementById('promo-cupom-limit');
const promoClearFormBtn = document.getElementById('clear-promo-cupom-form-btn');
const promoTableBody = document.getElementById('promo-cupons-table-body');

// --- ESTADO LOCAL ---
let allGameCampaigns = [];
let allPromoCoupons = []; // Novo estado para cupons promocionais

// ========================================================
//  LÓGICA PARA O JOGO "CUPOM MÁGICO" (EXISTENTE)
// ========================================================

const fetchAndRenderGameCampaigns = async () => {
    gameTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando campanhas...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(firestore, 'cupons'));
        allGameCampaigns = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        allGameCampaigns.sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
        
        renderGameTable();
    } catch (error) {
        console.error("Erro ao buscar campanhas:", error);
        gameTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;" class="error-message">Falha ao carregar campanhas.</td></tr>';
    }
};

const renderGameTable = () => {
    gameTableBody.innerHTML = '';
    if (allGameCampaigns.length === 0) {
        gameTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma campanha criada ainda.</td></tr>';
        return;
    }

    allGameCampaigns.forEach(campaign => {
        const tr = document.createElement('tr');
        tr.dataset.id = campaign.id;

        const startDate = new Date(campaign.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR');
        const endDate = new Date(campaign.dataFim + 'T00:00:00').toLocaleDateString('pt-BR');
        
        const statusClass = campaign.ativa ? 'status-concluído' : 'status-cancelado';
        const statusText = campaign.ativa ? 'Ativa' : 'Inativa';

        tr.innerHTML = `
            <td>
                <strong>${campaign.nome}</strong><br>
                <small>${campaign.desconto}% OFF</small>
            </td>
            <td>${startDate} a ${endDate}</td>
            <td>
                Tentativas: ${campaign.tentativas}<br>
                Chances: ${campaign.chances}
            </td>
            <td><span class="order-status ${statusClass}">${statusText}</span></td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon edit-btn" title="Editar Campanha"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-btn" title="Excluir Campanha"><i class="material-icons">delete</i></button>
                </div>
            </td>
        `;
        gameTableBody.appendChild(tr);
    });
};

const resetGameForm = () => {
    gameForm.reset();
    gameCampaignIdInput.value = '';
    gameFormTitle.textContent = 'Criar Campanha de Cupom';
    document.getElementById('campaign-status').value = 'true';
};

const populateGameFormForEdit = (id) => {
    const campaign = allGameCampaigns.find(c => c.id === id);
    if (!campaign) return;

    gameCampaignIdInput.value = id;
    gameFormTitle.textContent = 'Editar Campanha';
    document.getElementById('campaign-name').value = campaign.nome;
    document.getElementById('campaign-description').value = campaign.descricao;
    document.getElementById('campaign-discount').value = campaign.desconto;
    document.getElementById('campaign-startDate').value = campaign.dataInicio;
    document.getElementById('campaign-endDate').value = campaign.dataFim;
    document.getElementById('campaign-attempts').value = campaign.tentativas;
    document.getElementById('campaign-chances').value = campaign.chances;
    document.getElementById('campaign-status').value = campaign.ativa.toString();

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ========================================================
//  LÓGICA PARA CUPONS PROMOCIONAIS (NOVO)
// ========================================================

export const fetchAndRenderPromocionais = async () => {
    promoTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando cupons...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(firestore, 'cupons_promocionais'));
        allPromoCoupons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allPromoCoupons.sort((a, b) => new Date(b.dataValidade) - new Date(a.dataValidade)); // Mais novos primeiro
        renderPromocionaisTable();
    } catch (error) {
        console.error("Erro ao buscar cupons promocionais:", error);
        promoTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;" class="error-message">Falha ao carregar cupons.</td></tr>';
    }
};

const renderPromocionaisTable = () => {
    promoTableBody.innerHTML = '';
    if (allPromoCoupons.length === 0) {
        promoTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum cupom promocional criado.</td></tr>';
        return;
    }

    allPromoCoupons.forEach(coupon => {
        const tr = document.createElement('tr');
        tr.dataset.id = coupon.id;

        const expirationDate = new Date(coupon.dataValidade + 'T00:00:00').toLocaleDateString('pt-BR');
        const statusClass = coupon.ativa ? 'status-concluído' : 'status-cancelado';
        const statusText = coupon.ativa ? 'Ativo' : 'Inativo';

        let discountText = '';
        if (coupon.type === 'free_shipping') {
            discountText = 'Frete Grátis';
        } else {
            discountText = `${coupon.desconto}%`;
        }

        const usageText = coupon.limiteUsos > 0 ? `${coupon.vezesUsado || 0} / ${coupon.limiteUsos}` : 'Ilimitado';

        tr.innerHTML = `
            <td><strong>${coupon.codigo}</strong></td>
            <td>${discountText}</td>
            <td>${usageText}</td>
            <td>${expirationDate}</td>
            <td><span class="order-status ${statusClass}">${statusText}</span></td>
            <td>
                <div class="product-actions-admin">
                    <button class="btn-icon edit-btn" title="Editar Cupom"><i class="material-icons">edit</i></button>
                    <button class="btn-icon delete-btn" title="Excluir Cupom"><i class="material-icons">delete</i></button>
                </div>
            </td>
        `;
        promoTableBody.appendChild(tr);
    });
};

const resetPromocionaisForm = () => {
    promoForm.reset();
    promoCampaignIdInput.value = '';
    promoFormTitle.textContent = 'Criar Cupom Promocional';
    promoDiscountGroup.style.display = 'block';
    promoLimitInput.value = '100';
    document.getElementById('promo-cupom-status').value = 'true';
};

const populatePromocionaisFormForEdit = (id) => {
    const coupon = allPromoCoupons.find(c => c.id === id);
    if (!coupon) return;

    promoCampaignIdInput.value = id;
    promoFormTitle.textContent = 'Editar Cupom Promocional';
    promoCodeInput.value = coupon.codigo;
    promoTypeSelect.value = coupon.type || 'percentage';

    if (coupon.type === 'free_shipping') {
        promoDiscountGroup.style.display = 'none';
        promoDiscountInput.value = '';
    } else {
        promoDiscountGroup.style.display = 'block';
        promoDiscountInput.value = coupon.desconto || '';
    }
    promoLimitInput.value = coupon.limiteUsos ?? '100'; // Usa ?? para tratar 0 como válido
    document.getElementById('promo-cupom-expiration').value = coupon.dataValidade;
    document.getElementById('promo-cupom-status').value = coupon.ativa.toString();

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ========================================================
//  INICIALIZAÇÃO E EVENT LISTENERS
// ========================================================

/**
 * Função de inicialização para o módulo de "Cupom Mágico".
 */
export function init() { // A função init do jogo foi desativada, mas mantida para referência.
    // gameForm.addEventListener('submit', async (e) => {
    //     e.preventDefault();
    //     const id = gameCampaignIdInput.value;

    //     const campaignData = {
    //         nome: document.getElementById('campaign-name').value,
    //         descricao: document.getElementById('campaign-description').value,
    //         desconto: parseInt(document.getElementById('campaign-discount').value, 10),
    //         dataInicio: document.getElementById('campaign-startDate').value,
    //         dataFim: document.getElementById('campaign-endDate').value,
    //         tentativas: parseInt(document.getElementById('campaign-attempts').value, 10),
    //         chances: parseInt(document.getElementById('campaign-chances').value, 10),
    //         ativa: document.getElementById('campaign-status').value === 'true',
    //     };

    //     if (new Date(campaignData.dataFim) < new Date(campaignData.dataInicio)) {
    //         alert("A data de fim não pode ser anterior à data de início.");
    //         return;
    //     }

    //     try {
    //         if (id) {
    //             await updateDoc(doc(firestore, 'cupons', id), campaignData);
    //             alert('Campanha atualizada com sucesso!');
    //         } else {
    //             await addDoc(collection(firestore, 'cupons'), campaignData);
    //             alert('Campanha criada com sucesso!');
    //         }
    //         resetGameForm();
    //         await fetchAndRenderGameCampaigns();
    //     } catch (error) {
    //         console.error("Erro ao salvar campanha:", error);
    //         alert("Ocorreu um erro ao salvar a campanha.");
    //     }
    // });

    // gameTableBody.addEventListener('click', async (e) => {
    //     const row = e.target.closest('tr');
    //     if (!row) return;
    //     const id = row.dataset.id;

    //     if (e.target.closest('.edit-btn')) {
    //         populateGameFormForEdit(id);
    //     }

    //     if (e.target.closest('.delete-btn')) {
    //         if (confirm('Tem certeza que deseja excluir esta campanha? Esta ação não pode ser desfeita.')) {
    //             try {
    //                 await deleteDoc(doc(firestore, 'cupons', id));
    //                 alert('Campanha excluída com sucesso.');
    //                 await fetchAndRenderGameCampaigns();
    //             } catch (error) {
    //                 console.error("Erro ao excluir campanha:", error);
    //                 alert("Ocorreu um erro ao excluir a campanha.");
    //             }
    //         }
    //     }
    // });

    // gameClearFormBtn.addEventListener('click', resetGameForm);
    // fetchAndRenderGameCampaigns();
}

/**
 * Função de inicialização para o módulo de "Cupons Promocionais".
 */
export function initPromocionais() {
    promoCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    promoTypeSelect.addEventListener('change', () => {
        if (promoTypeSelect.value === 'free_shipping') {
            promoDiscountGroup.style.display = 'none';
            promoDiscountInput.required = false;
        } else {
            promoDiscountGroup.style.display = 'block';
            promoDiscountInput.required = true;
        }
    });

    promoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = promoCampaignIdInput.value;

        const couponData = {
            codigo: promoCodeInput.value,
            type: promoTypeSelect.value,
            desconto: parseInt(promoDiscountInput.value, 10) || 0,
            limiteUsos: parseInt(promoLimitInput.value, 10), // 0 para ilimitado
            dataValidade: document.getElementById('promo-cupom-expiration').value,
            ativa: document.getElementById('promo-cupom-status').value === 'true',
        };

        if (couponData.type === 'percentage' && (couponData.desconto <= 0 || couponData.desconto > 100)) {
            alert("Para cupons de porcentagem, o desconto deve ser entre 1 e 100.");
            return;
        }

        if (!couponData.codigo || !couponData.dataValidade) {
            alert("Por favor, preencha todos os campos obrigatórios.");
            return;
        }

        try {
            if (id) {
                const couponRef = doc(firestore, 'cupons_promocionais', id);
                await updateDoc(couponRef, couponData);
                alert('Cupom atualizado com sucesso!');
            } else {
                await addDoc(collection(firestore, 'cupons_promocionais'), couponData);
                alert('Cupom criado com sucesso!');
            }
            resetPromocionaisForm();
            await fetchAndRenderPromocionais();
        } catch (error) {
            console.error("Erro ao salvar cupom:", error);
            alert("Ocorreu um erro ao salvar o cupom.");
        }
    });

    promoTableBody.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const id = row.dataset.id;

        if (e.target.closest('.edit-btn')) {
            populatePromocionaisFormForEdit(id);
        }

        if (e.target.closest('.delete-btn')) {
            if (confirm('Tem certeza que deseja excluir este cupom?')) {
                try {
                    await deleteDoc(doc(firestore, 'cupons_promocionais', id));
                    alert('Cupom excluído com sucesso.');
                    await fetchAndRenderPromocionais();
                } catch (error) {
                    console.error("Erro ao excluir cupom:", error);
                    alert("Ocorreu um erro ao excluir o cupom.");
                }
            }
        }
    });

    promoClearFormBtn.addEventListener('click', resetPromocionaisForm);
    fetchAndRenderPromocionais();
}