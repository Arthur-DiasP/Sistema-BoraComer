// js/jogo.js

import { firestore } from './firebase-config.js';
import { doc, getDoc, serverTimestamp, addDoc, collection, query, where, Timestamp, limit, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Seletores de Estado da UI ---
    const loadingState = document.getElementById('loading-state');
    const activeGameState = document.getElementById('active-game-state');
    const noGameState = document.getElementById('no-game-state');

    // --- Seletores do Jogo ---
    const board = document.getElementById('tic-tac-toe-board');
    const cells = document.querySelectorAll('.cell');
    const statusDisplay = document.getElementById('game-status');
    const competeBtn = document.getElementById('compete-btn');
    const resetBtn = document.getElementById('reset-btn');
    const campaignNameEl = document.getElementById('campaign-name');
    const campaignPrizeEl = document.getElementById('campaign-prize');
    const campaignRulesEl = document.getElementById('campaign-rules');

    // --- Seletores dos Modais ---
    const pixModal = document.getElementById('pix-modal-overlay');
    const pixTotalValue = document.getElementById('pix-modal-total-value');
    const closePixBtn = document.getElementById('close-pix-modal-btn');
    const paymentMadeBtn = document.getElementById('payment-made-btn');
    const confirmationModal = document.getElementById('confirmation-overlay');
    const closeConfirmationBtn = document.getElementById('close-confirmation-btn');

    // --- Estado do Jogo ---
    let gameState = ["", "", "", "", "", "", "", "", ""];
    let gameActive = true;
    let currentPlayer = 'X'; // 'X' é o jogador, 'O' é a IA
    let activeCampaign = null;
    let isCompetitionMode = false;
    let userHasFreeTicket = false;

    const userId = sessionStorage.getItem('userId');
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));

    // --- Lógica de busca da campanha ativa ---
    function fetchActiveCampaign() {
        const now = Timestamp.now();
        const q = query(
            collection(firestore, "gameCampaigns"),
            where("isActive", "==", true),
            where("startTime", "<=", now),
            limit(1) // Pega apenas a primeira campanha que já começou
        );

        // onSnapshot escuta em tempo real, então se uma campanha começar enquanto o usuário está na página, ela aparecerá.
        onSnapshot(q, async (snapshot) => {
            loadingState.style.display = 'none';
            let foundCampaign = null;

            snapshot.forEach(doc => {
                const campaign = { id: doc.id, ...doc.data() };
                // O filtro final da data de término é feito no lado do cliente
                if (campaign.endTime.toDate() > now.toDate()) {
                    foundCampaign = campaign;
                }
            });

            if (foundCampaign) {
                activeCampaign = foundCampaign;
                await checkForFreeTicket(); // Verifica se o usuário tem ficha
                setupGameUI();
                activeGameState.style.display = 'block';
                noGameState.style.display = 'none';
            } else {
                activeGameState.style.display = 'none';
                noGameState.style.display = 'block';
            }
        }, (error) => {
            console.error("Erro ao buscar campanha:", error);
            loadingState.style.display = 'none';
            noGameState.innerHTML = '<p class="error-message">Erro ao carregar. Tente novamente.</p>';
            noGameState.style.display = 'block';
        });
    }

    async function checkForFreeTicket() {
        if (!userId) return;
        const userRef = doc(firestore, "users", userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists() && docSnap.data().gameTickets > 0) {
            userHasFreeTicket = true;
        } else {
            userHasFreeTicket = false;
        }
    }

    function setupGameUI() {
        campaignNameEl.textContent = activeCampaign.name;
        campaignPrizeEl.textContent = activeCampaign.prizeDescription;
        
        let costText = `R$ ${activeCampaign.cost.toFixed(2).replace('.', ',')}`;
        let buttonText = `Concorrer (${costText})`;
        
        if (userHasFreeTicket) {
            buttonText = `<i class="material-icons">confirmation_number</i> Usar Ficha Grátis`;
            competeBtn.classList.add('free-ticket');
        } else if (activeCampaign.cost === 0) {
            buttonText = `Concorrer (Grátis)`;
        }
        
        competeBtn.innerHTML = buttonText;
        campaignRulesEl.textContent = `Vença o jogo para concorrer! ${userHasFreeTicket ? 'Você tem uma ficha!' : `Custo: ${costText}`}`;
    }

    // --- Lógica do Jogo da Velha ---
    const winningConditions = [ [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6] ];

    function handleResultValidation() {
        let roundWon = false;
        for (const condition of winningConditions) {
            const [a, b, c] = condition.map(index => gameState[index]);
            if (a && a === b && b === c) { roundWon = true; break; }
        }

        if (roundWon) {
            gameActive = false;
            if (currentPlayer === 'X') {
                statusDisplay.textContent = 'Parabéns, você venceu!';
                if (isCompetitionMode) {
                    registerParticipation();
                }
            } else {
                statusDisplay.textContent = 'O Mestre Cuca venceu! Tente novamente.';
            }
            return;
        }
        if (!gameState.includes("")) {
            statusDisplay.textContent = 'Deu velha! Tente novamente.';
            gameActive = false;
        }
    }

    function handleCellClick(e) {
        const clickedCell = e.target;
        const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

        if (gameState[clickedCellIndex] !== "" || !gameActive || currentPlayer !== 'X') return;

        gameState[clickedCellIndex] = currentPlayer;
        clickedCell.innerHTML = currentPlayer;
        handleResultValidation();

        if (gameActive) {
            currentPlayer = 'O';
            statusDisplay.textContent = `Vez do Mestre Cuca...`;
            board.classList.add('locked');
            setTimeout(aiMove, 700);
        }
    }
    
    function aiMove() {
        if (!gameActive) return;
        const availableCells = gameState.map((cell, index) => cell === "" ? index : null).filter(val => val !== null);
        const moveIndex = availableCells[Math.floor(Math.random() * availableCells.length)];
        
        gameState[moveIndex] = currentPlayer;
        cells[moveIndex].innerHTML = currentPlayer;
        
        handleResultValidation();
        if (gameActive) {
            currentPlayer = 'X';
            statusDisplay.textContent = `Sua vez!`;
            board.classList.remove('locked');
        }
    }

    function handleResetGame() {
        gameActive = true;
        isCompetitionMode = false;
        currentPlayer = 'X';
        gameState = ["", "", "", "", "", "", "", "", ""];
        statusDisplay.textContent = `Escolha uma célula para começar!`;
        cells.forEach(cell => cell.innerHTML = "");
        board.classList.remove('locked');
        competeBtn.disabled = false;
    }

    // --- Lógica de Competição ---
    async function handleCompeteClick() {
        if (!userId) {
            alert("Você precisa estar logado para competir.");
            window.location.href = 'login.html';
            return;
        }

        handleResetGame();
        isCompetitionMode = true;
        competeBtn.disabled = true;
        
        if (userHasFreeTicket) {
            const userRef = doc(firestore, "users", userId);
            await updateDoc(userRef, { gameTickets: 0 }); // Consome a ficha
            statusDisplay.textContent = 'Ficha usada! Jogue para vencer.';
            userHasFreeTicket = false;
            competeBtn.classList.remove('free-ticket');
            competeBtn.innerHTML = `Concorrer (R$ ${activeCampaign.cost.toFixed(2)})`;
        } else if (activeCampaign.cost > 0) {
            // Lógica de pagamento PIX
            pixTotalValue.textContent = `R$ ${activeCampaign.cost.toFixed(2)}`;
            pixModal.classList.add('visible');
        } else {
            // Se for grátis, apenas ativa o modo de competição
            statusDisplay.textContent = 'Campanha Grátis! Jogue para vencer.';
        }
    }

    async function registerParticipation() {
        const participationData = {
            userId,
            userName: loggedInUser.nome,
            date: serverTimestamp(),
            campaignId: activeCampaign.id,
            type: userHasFreeTicket ? 'free_ticket' : (activeCampaign.cost > 0 ? 'paid' : 'free_campaign')
        };

        try {
            await addDoc(collection(firestore, "jogoDaVelhaParticipations"), participationData);
            confirmationModal.classList.add('visible');
        } catch(error) {
            console.error("Erro ao registrar participação:", error);
            alert("Erro ao registrar sua participação.");
        } finally {
            isCompetitionMode = false; // Finaliza o modo competição
        }
    }

    // --- Event Listeners ---
    cells.forEach(cell => cell.addEventListener('click', handleCellClick));
    resetBtn.addEventListener('click', handleResetGame);
    competeBtn.addEventListener('click', handleCompeteClick);
    
    // Listeners dos modais
    closePixBtn.addEventListener('click', () => {
        pixModal.classList.remove('visible');
        handleResetGame(); // Reseta se o pagamento for cancelado
    });
    paymentMadeBtn.addEventListener('click', () => {
        // Simula a confirmação do pagamento e libera o jogo
        pixModal.classList.remove('visible');
        statusDisplay.textContent = 'Pagamento confirmado! Jogue para vencer.';
    });
    closeConfirmationBtn.addEventListener('click', () => {
        confirmationModal.classList.remove('visible');
        handleResetGame(); // Reseta para a próxima partida
    });
    
    // --- Inicialização ---
    fetchActiveCampaign();
});