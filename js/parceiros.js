// js/parceiros.js

import { firestore } from './firebase-config.js';
import { collection, getDocs, query, where, doc, getDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const partnersListContainer = document.getElementById('partners-list');
    const couponModal = document.getElementById('coupon-modal-overlay');
    const closeModalBtn = document.getElementById('close-coupon-modal-btn');
    const modalPartnerName = document.getElementById('modal-partner-name');
    const generatedCouponCode = document.getElementById('generated-coupon-code');

    const userId = sessionStorage.getItem('userId');

    async function loadPartners() {
        if (!userId) {
            partnersListContainer.innerHTML = '<p class="info-message">Você precisa estar logado para ver os parceiros.</p><a href="login.html" class="btn btn-primary">Fazer Login</a>';
            return;
        }

        try {
            const q = query(collection(firestore, "parceiros"), where("ativo", "==", true));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                partnersListContainer.innerHTML = '<p>Nenhum parceiro disponível no momento. Volte em breve!</p>';
                return;
            }

            partnersListContainer.innerHTML = '';
            querySnapshot.forEach(doc => {
                const partner = { id: doc.id, ...doc.data() };
                const partnerCard = document.createElement('div');
                partnerCard.className = 'partner-card';
                partnerCard.innerHTML = `
                    <div class="partner-logo">
                        <img src="${partner.logoUrl}" alt="Logo ${partner.nome}">
                    </div>
                    <div class="partner-info">
                        <h3>${partner.nome}</h3>
                        <p>${partner.oferta}</p>
                        <button class="btn btn-primary generate-coupon-btn" data-id="${partner.id}" data-name="${partner.nome}">
                            Gerar Cupom de Vantagem
                        </button>
                    </div>
                `;
                partnersListContainer.appendChild(partnerCard);
            });

        } catch (error) {
            console.error("Erro ao carregar parceiros:", error);
            partnersListContainer.innerHTML = '<p class="error-message">Não foi possível carregar os parceiros. Tente novamente mais tarde.</p>';
        }
    }

    async function generateCoupon(partnerId, partnerName) {
        if (!userId) {
            alert("Faça login para gerar um cupom.");
            return;
        }

        modalPartnerName.textContent = partnerName;
        generatedCouponCode.textContent = 'GERANDO...';
        couponModal.classList.add('visible');

        try {
            // Verifica se o usuário já gerou cupom para este parceiro hoje
            const userRef = doc(firestore, "users", userId);
            const userSnap = await getDoc(userRef);
            const userData = userSnap.data();
            const todayStr = new Date().toISOString().split('T')[0];

            if (userData.couponsParceiros) {
                const existingCoupon = userData.couponsParceiros.find(c => c.partnerId === partnerId && c.date === todayStr);
                if (existingCoupon) {
                    generatedCouponCode.textContent = existingCoupon.code;
                    return;
                }
            }
            
            // Gera um novo código único
            const couponCode = `PZ-${partnerId.substring(0, 4).toUpperCase()}-${userId.substring(0, 4).toUpperCase()}${Date.now().toString().slice(-4)}`;
            
            // Salva o cupom no registro do usuário
            await updateDoc(userRef, {
                couponsParceiros: arrayUnion({
                    partnerId: partnerId,
                    partnerName: partnerName,
                    code: couponCode,
                    date: todayStr
                })
            });

            generatedCouponCode.textContent = couponCode;

        } catch (error) {
            console.error("Erro ao gerar cupom:", error);
            generatedCouponCode.textContent = 'ERRO';
            alert("Não foi possível gerar seu cupom. Tente novamente.");
        }
    }

    partnersListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('generate-coupon-btn')) {
            const partnerId = e.target.dataset.id;
            const partnerName = e.target.dataset.name;
            generateCoupon(partnerId, partnerName);
        }
    });

    closeModalBtn.addEventListener('click', () => {
        couponModal.classList.remove('visible');
    });
    
    couponModal.addEventListener('click', (e) => {
        if (e.target === couponModal) {
            couponModal.classList.remove('visible');
        }
    });

    loadPartners();
});