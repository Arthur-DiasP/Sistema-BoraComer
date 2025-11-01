// js/dashboard.js - O Controlador Principal

import { firestore } from './firebase-config.js';
import { collection, onSnapshot, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // ===============================================
    // LÓGICA DE NAVEGAÇÃO E CARREGAMENTO DE MÓDULOS
    // ===============================================
    const sidebar = document.querySelector('.sidebar');
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const contentSections = document.querySelectorAll('.content-section');
    const mainContentTitle = document.getElementById('main-content-title');

    // Mantém o controle dos módulos já carregados para não recarregá-los
    const loadedModules = new Set();

    /**
     * Carrega dinamicamente o módulo JavaScript para a seção solicitada.
     * Isso melhora o desempenho inicial, pois o código só é baixado quando necessário.
     * @param {string} sectionId - O ID da seção a ser carregada (ex: 'cardapio', 'pedidos').
     */
    const loadModuleFor = async (sectionId) => {
        if (loadedModules.has(sectionId)) return; // Se já carregou, não faz nada

        try {
            let module;
            switch (sectionId) {
                case 'inicio': module = await import('./dashboard-inicio.js'); break;
                case 'cardapio': module = await import('./dashboard-cardapio.js'); break;
                case 'personalizacoes': module = await import('./dashboard-personalizacoes.js'); break;
                case 'estoque': module = await import('./dashboard-estoque.js'); break;
                case 'ofertas': module = await import('./dashboard-ofertas.js'); break;
                case 'pedidos': module = await import('./dashboard-pedidos.js'); break;
                case 'entregadores': module = await import('./dashboard-entregadores.js'); break;
                case 'anuncios': module = await import('./dashboard-anuncios.js'); break;
                case 'avisos': module = await import('./dashboard-avisos.js'); break;
                case 'cupom': module = await import('./dashboard-cupom.js'); break;
                case 'cupons-promocionais': 
                    // Caso especial: carrega o mesmo módulo de cupom, mas chama uma função de inicialização diferente.
                    module = await import('./dashboard-cupom.js'); 
                    if (module && typeof module.initPromocionais === 'function') {
                        await module.initPromocionais();
                        // Não adiciona a loadedModules para permitir recarregar se necessário, ou ajusta a lógica
                        // Por enquanto, vamos adicionar para consistência.
                        loadedModules.add(sectionId); 
                    }
                    return; // Retorna para evitar a chamada do `init()` padrão
            case 'anunciantes-locais': module = await import('./dashboard-parceiros.js'); break;
            case 'campanhas-usuarios': module = await import('./dashboard-anunciantes.js'); break;
                case 'indicacoes': module = await import('./dashboard-indicacoes.js'); break;
                case 'logistica': module = await import('./dashboard-logistica.js'); break;
                case 'calendario': module = await import('./dashboard-calendario.js'); break;
                // Chatbot module removed
                default: 
                    console.warn(`Nenhum módulo definido para a seção: ${sectionId}`); 
                    return;
            }

            // A maioria dos módulos exporta uma função 'init'. Nós a chamamos aqui.
            if (module && typeof module.init === 'function') {
                await module.init(); 
                loadedModules.add(sectionId); // Marca o módulo como carregado
            }
        } catch (error) {
            console.error(`Falha ao carregar o módulo para a seção '${sectionId}':`, error);
        }
    };

    /**
     * Alterna a visualização entre as diferentes seções do dashboard.
     * @param {string} targetId - O ID da seção a ser exibida.
     */
    const switchSection = (targetId) => {
        // Esconde todas as seções e remove a classe 'active' de todos os links
        contentSections.forEach(section => section.classList.remove('active'));
        sidebarLinks.forEach(link => link.classList.remove('active'));
        
        // Mostra a seção alvo
        const targetSection = document.getElementById(`section-${targetId}`);
        if(targetSection) targetSection.classList.add('active');
        
        // Marca o link correspondente como ativo e atualiza o título principal
        const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
        if(activeLink) {
            activeLink.classList.add('active');
            mainContentTitle.textContent = activeLink.querySelector('span').textContent;
        }

        // Carrega o módulo JS associado à seção
        loadModuleFor(targetId);

        // Fecha o menu lateral em dispositivos móveis após a seleção
        if (window.innerWidth <= 768 && sidebar.classList.contains('sidebar-open')) {
            sidebar.classList.remove('sidebar-open');
            mobileMenuToggle.querySelector('i').textContent = 'menu';
        }
    };

    // Event listener para o botão do menu mobile
    mobileMenuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('sidebar-open');
        const icon = mobileMenuToggle.querySelector('i');
        icon.textContent = sidebar.classList.contains('sidebar-open') ? 'close' : 'menu';
    });

    // Event listener para todos os links de navegação da sidebar
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            if (!link.classList.contains('active')) {
                switchSection(target);
            }
        });
    });

    // ================================================================
    // SISTEMA DE NOTIFICAÇÃO DE PEDIDOS EM TEMPO REAL (PERSISTENTE)
    // ================================================================
    function initializeRealtimeOrderNotifier() {
        const notificationBar = document.getElementById('persistent-notification-bar');
        const notificationMessage = document.getElementById('notification-message');
        const viewOrderBtn = document.getElementById('view-order-btn');
        const notificationCloseBtn = document.getElementById('notification-close-btn');
        const soundElement = document.getElementById('notification-sound');

        const hideNotification = () => {
            notificationBar.classList.remove('visible');
        };
        
        notificationCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideNotification();
        });

        viewOrderBtn.addEventListener('click', () => {
            hideNotification();
            switchSection('pedidos');
        });
        
        // Define o ponto de partida para a escuta de novos pedidos (agora)
        const startTime = Timestamp.now();
        const q = query(collection(firestore, "pedidos"), where("data", ">", startTime));

        onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                // Dispara a notificação apenas para documentos recém-adicionados
                if (change.type === "added") {
                    const pedido = change.doc.data();
                    const nomeCliente = pedido.cliente?.nome || "Novo Cliente";
                    
                    // ATUALIZAÇÃO: A mensagem agora mostra o status do pedido
                    if (pedido.status === 'Concluído') {
                        notificationMessage.textContent = `Novo pedido de ${nomeCliente} (Pagamento Confirmado)!`;
                    } else {
                        notificationMessage.textContent = `Pedido de ${nomeCliente} acaba de chegar! (Status: ${pedido.status})`;
                    }
                    
                    notificationBar.classList.add('visible');

                    // Tenta tocar o som de notificação
                    soundElement.play().catch(error => {
                        console.warn("A reprodução automática de som foi bloqueada pelo navegador.", error);
                    });

                    // Adiciona um efeito de pulsação ao card de "Pedidos Hoje"
                    const cardPedidosHoje = document.getElementById('card-pedidos-hoje');
                    if (cardPedidosHoje) {
                        cardPedidosHoje.classList.remove('new-order-pulse');
                        void cardPedidosHoje.offsetWidth; // Força o reflow para reiniciar a animação
                        cardPedidosHoje.classList.add('new-order-pulse');
                    }
                }
            });
        });
    }

    // ===============================================
    // INICIALIZAÇÃO DA PÁGINA
    // ===============================================
    switchSection('inicio'); // Exibe a seção 'Início' por padrão
    initializeRealtimeOrderNotifier(); // Ativa o listener de novos pedidos
});