// js/main.js

import { firestore } from './firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Atualiza o número no ícone do carrinho na barra de navegação.
 */
export function updateCartBadge() {
    const cartBadge = document.getElementById('cart-badge');
    if (!cartBadge) return;

    try {
        const cart = JSON.parse(localStorage.getItem('pizzariaCart')) || {};
        const itemCount = Object.keys(cart).length;
        if (itemCount > 0) {
            cartBadge.textContent = itemCount;
            cartBadge.classList.add('visible');
        } else {
            cartBadge.classList.remove('visible');
        }
    } catch (error) {
        console.error("Erro ao ler o carrinho do localStorage:", error);
    }
}

/**
 * =================================================================
 *  SISTEMA DE NOTIFICAÇÃO E PERMISSÃO DE MÍDIA PARA O CLIENTE
 * =================================================================
 */

// Elementos de áudio e notificação (declarados globalmente no módulo)
let soundToast, soundDelivery, toastContainer, deliveryOverlay;

/**
 * Cria os elementos HTML para as notificações (toast e overlay de entrega) e os
 * anexa ao corpo da página. A função só executa uma vez para evitar duplicatas.
 */
function createNotificationElements() {
    // Se o elemento já existe, não faz nada.
    if (document.getElementById('client-notification-toast')) return;

    // Toast para "Pedido Confirmado"
    toastContainer = document.createElement('div');
    toastContainer.id = 'client-notification-toast';
    toastContainer.className = 'client-toast';
    
    soundToast = document.createElement('audio');
    soundToast.id = 'client-notification-sound';
    soundToast.src = 'https://assets.codepen.io/296057/completion.mp3';
    soundToast.preload = 'auto';

    // Overlay de tela cheia para "Pedido Chegou"
    deliveryOverlay = document.createElement('div');
    deliveryOverlay.id = 'delivery-arrived-overlay';
    deliveryOverlay.innerHTML = `
        <div class="delivery-content">
            <img src="img/Logo.png" alt="Logo Pizzaria Moraes" class="delivery-logo">
            <h2 class="delivery-message">O SEU PEDIDO CHEGOU!!!</h2>
        </div>
    `;
    
    soundDelivery = document.createElement('audio');
    soundDelivery.id = 'delivery-arrived-sound';
    soundDelivery.src = 'https://assets.codepen.io/296057/success.mp3';
    soundDelivery.preload = 'auto';

    document.body.append(toastContainer, soundToast, deliveryOverlay, soundDelivery);
}

/**
 * Inicia um "ouvinte" em tempo real no Firestore para os pedidos do usuário logado.
 * Quando o status de um pedido muda, ele dispara as notificações correspondentes.
 */
function initializeOrderStatusNotifier() {
    const userId = sessionStorage.getItem('userId');
    if (!userId) return;

    console.log("Sistema de notificação de pedidos ATIVADO para o usuário:", userId);

    // Guarda os IDs dos pedidos já notificados para não repetir
    const notifiedCompletedOrders = new Set();
    const notifiedArrivedOrders = new Set();

    const q = query(collection(firestore, "pedidos"), where("userId", "==", userId));

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            // Reage apenas a modificações em pedidos existentes
            if (change.type === "modified") {
                const orderId = change.doc.id;
                const orderData = change.doc.data();

                // 1. Notificação de Pedido Concluído (Toast)
                if (orderData.status === 'Concluído' && !notifiedCompletedOrders.has(orderId)) {
                    toastContainer.innerHTML = `
                        <div class="client-toast-icon">✅</div>
                        <div class="client-toast-content">
                            <h4>Pedido Confirmado!</h4>
                            <p>Estamos preparando o seu pedido, aguarde 40 – 60 minutos. Obrigado!</p>
                        </div>
                    `;
                    toastContainer.classList.add('visible');
                    soundToast.play().catch(e => console.warn("Reprodução de áudio bloqueada pelo navegador."));
                    notifiedCompletedOrders.add(orderId);
                    // Esconde o toast após 10 segundos
                    setTimeout(() => toastContainer.classList.remove('visible'), 10000);
                }

                // 2. Notificação de Pedido CHEGOU (Tela Cheia)
                if (orderData.statusEntrega === 'entregue' && !notifiedArrivedOrders.has(orderId)) {
                    deliveryOverlay.classList.add('visible');
                    soundDelivery.play().catch(e => console.warn("Reprodução de áudio bloqueada pelo navegador."));
                    notifiedArrivedOrders.add(orderId);

                    // Permite fechar o overlay ao clicar nele
                    deliveryOverlay.onclick = () => deliveryOverlay.classList.remove('visible');
                }
            }
        });
    });
}

/**
 * Gerencia a exibição do modal de permissão de mídia (áudio/vídeo).
 * Este modal é crucial para que os sons de notificação funcionem em navegadores modernos.
 */
function handleMediaPermission() {
    const permissionOverlay = document.getElementById('media-permission-overlay');
    const acceptBtn = document.getElementById('accept-media-btn');
    const hasAccepted = localStorage.getItem('mediaPermissionAccepted') === 'true';

    if (hasAccepted) {
        // Se a permissão já foi dada, o sistema de notificação é iniciado imediatamente.
        initializeOrderStatusNotifier();
    } else {
        // Mostra o pop-up apenas se ele existir na página atual (cardapio.html).
        if (permissionOverlay && acceptBtn) {
            permissionOverlay.classList.add('visible');

            acceptBtn.addEventListener('click', () => {
                // Tenta "desbloquear" todos os áudios da página com uma interação do usuário.
                const allAudio = document.querySelectorAll('audio');
                allAudio.forEach(audio => {
                    audio.muted = true;
                    audio.play().then(() => {
                        audio.pause();
                        audio.currentTime = 0;
                        audio.muted = false;
                    }).catch(e => {});
                });

                // Salva a escolha para não perguntar novamente.
                localStorage.setItem('mediaPermissionAccepted', 'true');
                permissionOverlay.classList.remove('visible');

                // Inicia o sistema de notificação pela primeira vez após a permissão.
                initializeOrderStatusNotifier();
                
                console.log("Permissão de mídia aceita e salva.");
            }, { once: true }); // O listener executa apenas uma vez.
        }
    }
}

// --- PONTO DE ENTRADA DO SCRIPT ---
// Estas funções rodam em todas as páginas do cliente quando o DOM está pronto.
document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
    createNotificationElements();
    
    // A lógica de permissão é chamada em todas as páginas, mas só terá efeito visual
    // na página que contém o modal (`cardapio.html`). Em outras páginas, ela simplesmente
    // iniciará o notificador se a permissão já tiver sido concedida.
    handleMediaPermission();
});