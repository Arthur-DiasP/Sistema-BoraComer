// js/indicacao.js

import { firestore } from './firebase-config.js';
import { doc, getDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Seletores do DOM ---
    const creditBalanceEl = document.getElementById('credit-balance');
    const referralLinkInput = document.getElementById('referral-link-input');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const referralsListContainer = document.getElementById('referrals-list');
    const leaderboardListContainer = document.getElementById('leaderboard-list');

    const userId = sessionStorage.getItem('userId');

    // Função para formatar moeda
    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    // Verifica se o usuário está logado
    if (!userId) {
        alert("Você precisa estar logado para acessar o programa de indicação.");
        window.location.href = 'login.html';
        return;
    }

    // Gera e exibe o link de indicação
    function generateAndDisplayLink() {
        const baseUrl = window.location.origin;
        const referralLink = `${baseUrl}/login.html?ref=${userId}`;
        referralLinkInput.value = referralLink;
    }

    // Função para copiar o link
    function copyLink() {
        referralLinkInput.select();
        document.execCommand('copy');
        copyFeedback.classList.add('show');
        setTimeout(() => {
            copyFeedback.classList.remove('show');
        }, 2000);
    }

    // Escuta em tempo real as atualizações do usuário (crédito e indicações)
    function listenToUserUpdates() {
        const userRef = doc(firestore, "users", userId);
        
        onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                
                // Atualiza o saldo de crédito
                creditBalanceEl.textContent = formatCurrency(userData.referralCredit || 0);

                // Atualiza a lista de indicações bem-sucedidas
                renderReferralsList(userData.successfulReferrals || []);
            } else {
                console.error("Usuário não encontrado no Firestore.");
                // Tratar erro, talvez redirecionar para o login
            }
        }, (error) => {
            console.error("Erro ao escutar atualizações do usuário:", error);
            referralsListContainer.innerHTML = '<p class="error-message">Erro ao carregar dados.</p>';
        });
    }

    // Renderiza a lista de amigos indicados
    function renderReferralsList(referrals) {
        if (referrals.length === 0) {
            referralsListContainer.innerHTML = '<p class="no-referrals-message">Quando seus amigos usarem seu link, eles aparecerão aqui!</p>';
            return;
        }

        referralsListContainer.innerHTML = ''; // Limpa a lista
        referrals.sort((a, b) => b.date.toMillis() - a.date.toMillis()); // Ordena mais recentes primeiro

        referrals.forEach(ref => {
            const referralItem = document.createElement('div');
            referralItem.className = 'referral-item';
            
            const date = ref.date.toDate().toLocaleDateString('pt-br');

            referralItem.innerHTML = `
                <div class="referral-person">
                    <i class="material-icons">person</i>
                    <div class="referral-details">
                        <span class="referral-name">${ref.name}</span>
                        <span class="referral-date">Indicado em ${date}</span>
                    </div>
                </div>
                <div class="referral-reward">
                    + R$ 10,00
                </div>
            `;
            referralsListContainer.appendChild(referralItem);
        });
    }

    /**
     * Busca todos os usuários, calcula o número de indicações e renderiza o ranking dos top 3.
     */
    async function renderLeaderboard() {
        leaderboardListContainer.innerHTML = '<p class="no-referrals-message">Carregando o ranking...</p>';
        try {
            const usersSnapshot = await getDocs(collection(firestore, "users"));
            const usersWithReferrals = usersSnapshot.docs
                .map(doc => doc.data())
                .filter(user => user.successfulReferrals && user.successfulReferrals.length > 0)
                .map(user => ({
                    name: user.nome,
                    referralCount: user.successfulReferrals.length
                }));

            usersWithReferrals.sort((a, b) => b.referralCount - a.referralCount);

            const top3 = usersWithReferrals.slice(0, 3);

            if (top3.length === 0) {
                leaderboardListContainer.innerHTML = '<p class="no-referrals-message">Ainda não há embaixadores no ranking. Seja o primeiro!</p>';
                return;
            }

            leaderboardListContainer.innerHTML = '';
            const medalIcons = ['emoji_events', 'military_tech', 'workspace_premium'];
            const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

            top3.forEach((user, index) => {
                const item = document.createElement('div');
                item.className = 'leaderboard-item';
                item.innerHTML = `
                    <div class="leaderboard-position">
                        <i class="material-icons" style="color: ${medalColors[index]}">${medalIcons[index]}</i>
                    </div>
                    <div class="leaderboard-name">${user.name.split(' ')[0]}</div>
                    <div class="leaderboard-count">
                        <strong>${user.referralCount}</strong>
                        <span>indicações</span>
                    </div>
                `;
                leaderboardListContainer.appendChild(item);
            });

        } catch (error) {
            console.error("Erro ao carregar o leaderboard:", error);
            leaderboardListContainer.innerHTML = '<p class="error-message">Não foi possível carregar o ranking.</p>';
        }
    }


    // --- Inicialização e Event Listeners ---
    copyLinkBtn.addEventListener('click', copyLink);
    
    generateAndDisplayLink();
    listenToUserUpdates();
    renderLeaderboard();
});