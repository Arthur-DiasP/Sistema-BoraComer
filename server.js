// server.js
import express from 'express';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer } from 'ws';
import { getFirestore, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

// Importa a configuração do Firebase (assumindo que o caminho está correto)
import { firebaseConfig } from './js/firebase-config-server.js';
// ==========================================================
// 🎯 MUDANÇA 1: BLOCO PARA SILENCIAR LOGS EM PRODUÇÃO (RENDER)
// ==========================================================
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
    // Sobrescreve console.log e console.info para que não façam nada em produção.
    // MANTEMOS console.error ativo para ver erros críticos.
    console.log = function() {};
    console.info = function() {};
    console.debug = function() {};
}
// ==========================================================

// Inicializa o Firebase no servidor
const firebaseApp = initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);

// ===== Corrige __dirname em ESModules =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Carrega variáveis de ambiente =====
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middlewares (sem alterações) =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== Servir arquivos estáticos (sem alterações) =====
app.use(express.static(__dirname));

// ========================
// CONFIGURAÇÃO ASAAS
// ========================
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_URL = 'https://www.asaas.com/api/v3';

// Verifica se a chave de API foi carregada corretamente
if (!ASAAS_API_KEY) {
    console.error("ERRO CRÍTICO: A variável de ambiente ASAAS_API_KEY não foi encontrada.");
    console.error("Crie um arquivo .env na raiz com: ASAAS_API_KEY=sua_chave_aqui");
    process.exit(1);
}

const asaasAPI = async (endpoint, method = 'GET', body = null) => {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'access_token': ASAAS_API_KEY
        }
    };
    if (body) options.body = JSON.stringify(body);
    return fetch(`${ASAAS_URL}${endpoint}`, options);
};

// ========================
// ROTA DA API: criar pagamento (LOGS REMOVIDOS/CONDICIONADOS)
// ========================
app.post('/api/create-payment', async (req, res) => {
    try {
        const { userData, addressData, total, paymentMethod, cardData } = req.body;

        if (!userData || !userData.nome || !userData.email || !userData.cpf) {
            return res.status(400).json({ error: 'Dados do usuário incompletos.' });
        }

        // Limpa CPF e telefone
        const cleanCpf = userData.cpf.replace(/\D/g, '');
        const phoneClean = userData.telefone ? userData.telefone.replace(/\D/g, '') : '';
        const postalCodeClean = addressData && addressData.cep ? addressData.cep.replace(/\D/g, '') : '';

        let customerId;

        // 1) Tentar encontrar cliente existente pelo CPF/CNPJ
        const findCustomerResponse = await asaasAPI(`/customers?cpfCnpj=${cleanCpf}`);
        const findCustomerData = await findCustomerResponse.json();

        if (findCustomerResponse.ok && findCustomerData.data && findCustomerData.data.length > 0) {
            customerId = findCustomerData.data[0].id;
        } else {
            // 2) Criar novo cliente
            const customerPayload = {
                name: userData.nome,
                email: userData.email,
                cpfCnpj: cleanCpf,
                phone: phoneClean,
                postalCode: postalCodeClean,
                address: addressData?.rua || '',
                addressNumber: addressData?.numero || '',
                complement: addressData?.complemento || '',
                district: addressData?.bairro || ''
            };

            const createCustomerResponse = await asaasAPI('/customers', 'POST', customerPayload);
            const createCustomerData = await createCustomerResponse.json();

            if (!createCustomerResponse.ok) {
                console.error('Erro ao criar cliente Asaas:', createCustomerData);
                return res.status(400).json({ error: 'Erro ao criar cliente', details: createCustomerData.errors || createCustomerData });
            }

            customerId = createCustomerData.id;
        }

        // 3) Monta payload do pagamento
        const paymentPayload = {
            customer: customerId,
            billingType: (paymentMethod || 'BOLETO').toUpperCase(),
            value: total,
            dueDate: new Date().toISOString().split('T')[0],
            description: `Pedido na Pizzaria Moraes para ${userData.nome}`
        };

        // 4) Se for cartão, anexa dados
        if ((paymentMethod || '').toUpperCase().includes('CARD')) {
            if (!cardData) return res.status(400).json({ error: 'Dados do cartão não fornecidos.' });

            paymentPayload.creditCard = {
                holderName: cardData.name,
                number: cardData.number.replace(/\s/g, ''),
                expiryMonth: cardData.expiryMonth,
                expiryYear: cardData.expiryYear,
                ccv: cardData.cvv
            };

            paymentPayload.creditCardHolderInfo = {
                name: userData.nome,
                email: userData.email,
                cpfCnpj: cleanCpf,
                postalCode: postalCodeClean,
                addressNumber: addressData?.numero || '',
                phone: phoneClean
            };
        }

        // 5) Faz a chamada para criar o pagamento
        const paymentResponse = await asaasAPI('/payments', 'POST', paymentPayload);
        const paymentData = await paymentResponse.json();

        // 🎯 MUDANÇA 2: REMOVE OU CONDICIONA LOG DE RESPOSTA DETALHADA
        // console.log('RESPOSTA INICIAL DA CRIAÇÃO:', JSON.stringify(paymentData, null, 2)); 

        if (!paymentResponse.ok) {
            console.error('Erro da API Asaas ao criar pagamento:', paymentData);
            return res.status(400).json({ error: 'Erro ao criar pagamento', details: paymentData.errors || paymentData });
        }

        // 6) Se for PIX, buscar QR Code extra
        if (paymentData.billingType === 'PIX' && paymentData.id) {
            // 🎯 MUDANÇA 3: REMOVE OU CONDICIONA LOG DE BUSCA
            // console.log(`Pagamento PIX criado com ID: ${paymentData.id}. Buscando QR Code...`); 
            const getQrCodeResponse = await asaasAPI(`/payments/${paymentData.id}/pixQrCode`);
            const qrCodeData = await getQrCodeResponse.json();

            // 🎯 MUDANÇA 4: REMOVE OU CONDICIONA LOG DE RESPOSTA QR CODE
            // console.log('RESPOSTA DA BUSCA PELO QR CODE:', JSON.stringify(qrCodeData, null, 2)); 

            if (!getQrCodeResponse.ok) {
                return res.status(400).json({ error: 'Pagamento criado, mas falha ao obter QR Code', details: qrCodeData.errors || qrCodeData });
            }

            const fullPaymentData = { ...paymentData, pixQrCode: qrCodeData };
            return res.json(fullPaymentData);
        }

        // 7) Retorna dados do pagamento criado
        res.json(paymentData);

    } catch (error) {
        console.error('Erro interno no servidor (/api/create-payment):', error);
        res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
    }
});

// ==========================================================
// 🎯 NOVA ROTA: Criar Pagamento para Anúncios
// ==========================================================
app.post('/api/create-ad-payment', async (req, res) => {
    try {
        const { userData, adId, budget } = req.body;

        if (!userData || !adId || !budget) {
            return res.status(400).json({ error: 'Dados do anúncio incompletos (userData, adId, budget).'});
        }

        // 1. Usa os dados do usuário recebidos do cliente
        const cleanCpf = userData.cpf?.replace(/\D/g, '');
        
        if (!cleanCpf || cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido ou ausente no perfil do usuário.' });
        }

        // 2. Encontrar ou criar cliente no Asaas
        let customerId;
        const findCustomerResponse = await asaasAPI(`/customers?cpfCnpj=${cleanCpf}`);
        const findCustomerData = await findCustomerResponse.json();

        if (findCustomerResponse.ok && findCustomerData.data && findCustomerData.data.length > 0) {
            customerId = findCustomerData.data[0].id;
        } else {
            const customerPayload = {
                name: userData.nome,
                email: userData.email,
                cpfCnpj: cleanCpf,
                phone: userData.telefone?.replace(/\D/g, '') || '',
            };
            const createCustomerResponse = await asaasAPI('/customers', 'POST', customerPayload);
            const createCustomerData = await createCustomerResponse.json();
            if (!createCustomerResponse.ok) {
                console.error('Erro ao criar cliente Asaas para anúncio:', createCustomerData);
                return res.status(400).json({ error: 'Erro ao registrar cliente no sistema de pagamentos.', details: createCustomerData.errors });
            }
            customerId = createCustomerData.id;
        }

        // 3. Criar a cobrança PIX no Asaas
        const paymentPayload = {
            customer: customerId,
            billingType: 'PIX',
            value: budget,
            dueDate: new Date().toISOString().split('T')[0],
            description: `Pagamento de campanha no BoraComer (ID: ${adId})`
        };

        const paymentResponse = await asaasAPI('/payments', 'POST', paymentPayload);
        const paymentData = await paymentResponse.json();

        if (!paymentResponse.ok) {
            console.error('Erro da API Asaas ao criar pagamento de anúncio:', paymentData);
            return res.status(400).json({ error: 'Erro ao criar a cobrança.', details: paymentData.errors });
        }

        // 5. Buscar o QR Code para a cobrança PIX criada
        const getQrCodeResponse = await asaasAPI(`/payments/${paymentData.id}/pixQrCode`);
        const qrCodeData = await getQrCodeResponse.json();

        if (!getQrCodeResponse.ok) {
            return res.status(400).json({ error: 'Cobrança criada, mas falha ao obter QR Code.', details: qrCodeData.errors });
        }

        // 6. Retornar os dados completos para o cliente
        const fullPaymentData = {
            ...paymentData,
            pixQrCode: qrCodeData,
            id: paymentData.id // Garante que o ID do pagamento esteja no nível raiz
        };
        res.json(fullPaymentData);

    } catch (error) {
        console.error('Erro interno no servidor (/api/create-ad-payment):', error);
        res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
    }
});

// ==========================================================
// 🎯 NOVA ROTA: Criar Pagamento para o Jogo
// ==========================================================
app.post('/api/create-game-payment', async (req, res) => {
    try {
        const { userData, campaignId, cost } = req.body;

        if (!userData || !campaignId || cost === undefined) {
            return res.status(400).json({ error: 'Dados da campanha do jogo incompletos (userData, campaignId, cost).'});
        }

        const cleanCpf = userData.cpf?.replace(/\D/g, '');
        if (!cleanCpf || cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido ou ausente no perfil do usuário.' });
        }

        // 1. Encontrar ou criar cliente no Asaas
        let customerId;
        const findCustomerResponse = await asaasAPI(`/customers?cpfCnpj=${cleanCpf}`);
        const findCustomerData = await findCustomerResponse.json();

        if (findCustomerResponse.ok && findCustomerData.data && findCustomerData.data.length > 0) {
            customerId = findCustomerData.data[0].id;
        } else {
            const customerPayload = {
                name: userData.nome,
                email: userData.email,
                cpfCnpj: cleanCpf,
                phone: userData.telefone?.replace(/\D/g, '') || '',
            };
            const createCustomerResponse = await asaasAPI('/customers', 'POST', customerPayload);
            const createCustomerData = await createCustomerResponse.json();
            if (!createCustomerResponse.ok) {
                return res.status(400).json({ error: 'Erro ao registrar cliente no sistema de pagamentos.', details: createCustomerData.errors });
            }
            customerId = createCustomerData.id;
        }

        // 2. Criar a cobrança PIX no Asaas
        const paymentPayload = {
            customer: customerId,
            billingType: 'PIX',
            value: cost,
            dueDate: new Date().toISOString().split('T')[0],
            description: `Pagamento para jogar no BoraComer (Campanha ID: ${campaignId})`
        };

        const paymentResponse = await asaasAPI('/payments', 'POST', paymentPayload);
        const paymentData = await paymentResponse.json();

        if (!paymentResponse.ok) {
            return res.status(400).json({ error: 'Erro ao criar a cobrança.', details: paymentData.errors });
        }

        // 3. Buscar o QR Code
        const getQrCodeResponse = await asaasAPI(`/payments/${paymentData.id}/pixQrCode`);
        const qrCodeData = await getQrCodeResponse.json();

        if (!getQrCodeResponse.ok) return res.status(400).json({ error: 'Cobrança criada, mas falha ao obter QR Code.', details: qrCodeData.errors });

        // Notifica o cliente via WebSocket que o pagamento foi criado (status PENDING)
        notifyClient(paymentData.id, 'PENDING');

        res.json({ ...paymentData, pixQrCode: qrCodeData, id: paymentData.id });

    } catch (error) {
        console.error('Erro interno no servidor (/api/create-game-payment):', error);
        res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
    }
});

// ========================
// ROTA DA API: Consultar Status do Pagamento (sem alterações)
// ========================
app.get('/api/payment-status/:id', async (req, res) => {
    try {
        const paymentId = req.params.id;
        if (!paymentId) {
            return res.status(400).json({ error: 'ID do pagamento não fornecido.' });
        }

        const response = await asaasAPI(`/payments/${paymentId}`);
        const data = await response.json();

        if (!response.ok) {
            console.error('Erro ao consultar status do Asaas:', data);
            return res.status(response.status).json({ error: 'Falha ao buscar status do pagamento no Asaas', details: data.errors || data });
        }

        res.json({ status: data.status, value: data.value, billingType: data.billingType, id: data.id });

    } catch (error) {
        console.error('Erro interno no servidor (/api/payment-status):', error);
        res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
    }
});

/**
 * SIMULAÇÃO DE NOTIFICAÇÃO (sem alteração)
 */
function simulateUserNotification(paymentId, message) {
    // 🎯 MUDANÇA 5: LOGS CONDICIONAIS PARA MENSAGENS DE SIMULAÇÃO
    if (!isProduction) { 
        console.log(`\n*** NOTIFICAÇÃO PARA O USUÁRIO (Simulação) ***`);
        console.log(`Pagamento ID: ${paymentId}`);
        console.log(`Mensagem: ${message}`);
        console.log(`**********************************\n`);
    }
}

// ========================
// ROTA DO WEBHOOK ASAAS (AGORA CONFIGURADA PARA USAR PAYMENT_CREATED para PENDENTE)
// ========================
app.post('/webhook/asaas', async (req, res) => {
    const notification = req.body;
    const { event, payment } = notification;

    // 🎯 MUDANÇA 6: LOGS DE WEBHOOK CONDICIONAIS
    if (!isProduction) {
        console.log(`\n--- Webhook Asaas Recebido ---`);
        console.log(`Evento: ${event}`);
        console.log(`ID do Pagamento: ${payment?.id || 'N/A'}`);
        console.log(`Status do Pagamento: ${payment?.status || 'N/A'}`);
        console.log('-------------------------------\n');
    }

    try {
        if (!payment || !payment.id) {
            console.error('Webhook recebido sem ID de pagamento.');
            return res.status(200).json({ received: true, message: 'Dados de pagamento incompletos.' });
        }

        switch (event) {
            case 'PAYMENT_RECEIVED': 
            case 'PAYMENT_CONFIRMED':
                // 🎯 MUDANÇA 7: LOGS DE CONFIRMAÇÃO CONDICIONAIS
                if (!isProduction) {
                    console.log(`✅ Pagamento ${payment.id} recebido/confirmado! Status do pedido precisa ser alterado no DB.`);
                    simulateUserNotification(
                        payment.id,
                        `Seu pagamento de R$ ${payment.value} foi confirmado! Seu pedido está sendo preparado. 🍕`
                    );
                }
                notifyClient(payment.id, payment.status); // Notifica o cliente via WebSocket

                break;

            // ==========================================================
            // 🎯 MUDANÇA DE CONFIGURAÇÃO: USAMOS PAYMENT_CREATED PARA TRATAR PENDÊNCIA
            // ==========================================================
            case 'PAYMENT_CREATED': 
                if (payment.status === 'PENDING') {
                    // Este é o momento correto de registrar o pagamento como pendente (boleto gerado, PIX gerado)
                    if (!isProduction) {
                        console.log(`⏳ Pagamento ${payment.id} ainda pendente (CREATED com status PENDING).`);
                    }
                    // A notificação para o cliente é importante mesmo em produção para o WebSocket funcionar
                    notifyClient(payment.id, payment.status); // Notifica o cliente que está pendente
                }
                break;
            // ==========================================================


            case 'PAYMENT_OVERDUE': 
                // 🎯 MUDANÇA 9: LOGS DE VENCIMENTO CONDICIONAIS
                if (!isProduction) {
                    console.log(`❌ Pagamento ${payment.id} está vencido. Marcar pedido como Cancelado/Vencido no DB.`);
                }
                simulateUserNotification(
                    payment.id,
                    `Seu pagamento de R$ ${payment.value} venceu. Por favor, faça um novo pedido.`
                );
                notifyClient(payment.id, payment.status); // Notifica o cliente via WebSocket
                break;
            
            default:
                // 🎯 MUDANÇA 10: LOGS DE EVENTO CONDICIONAIS
                if (!isProduction) {
                    console.log(`Evento ${event} recebido, mas sem ação específica definida.`);
                }
        }

        res.status(200).json({ received: true });

    } catch (error) {
        console.error('Erro ao processar webhook do Asaas:', error);
        res.status(200).json({ received: true, error: 'Internal processing error' });
    }
});

// ==========================================================
// Roteamento e Servidor (sem alterações na lógica principal)
// ==========================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/:page', (req, res, next) => {
    const page = req.params.page;
    if (page.startsWith('api') || page.startsWith('webhook') || page.includes('.')) return next();

    const filePath = path.join(__dirname, `${page}.html`);
    res.sendFile(filePath, (err) => {
        if (err) next();
    });
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'), (err) => {
        if (err) res.status(404).send('<h1>404 - Página não encontrada</h1>');
    });
});

// ===== Inicializar servidor (LOG FINAL MUDADO) =====
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Mapa para associar paymentId a conexões WebSocket
const paymentClients = new Map();

wss.on('connection', (ws) => {
    console.log('Cliente WebSocket conectado');
    let paymentIdForClient = null; // Para rastrear o paymentId desta conexão

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'register' && data.paymentId) {
                paymentIdForClient = data.paymentId;
                paymentClients.set(paymentIdForClient, ws);
                console.log(`Cliente registrado para o paymentId: ${paymentIdForClient}`);
            }
        } catch (e) {
            console.log('Mensagem inválida recebida: %s', message);
        }
    });
    ws.on('close', () => {
        console.log('Cliente WebSocket desconectado');
        // Remove o cliente do mapa quando a conexão é fechada
        if (paymentIdForClient) {
            paymentClients.delete(paymentIdForClient);
            console.log(`Cliente para o paymentId: ${paymentIdForClient} foi removido.`);
        }
    });
});

// Função para notificar o cliente via WebSocket
function notifyClient(paymentId, status) {
    if (paymentClients.has(paymentId)) {
        const ws = paymentClients.get(paymentId);
        if (ws.readyState === 1) { // 1 === WebSocket.OPEN
            console.log(`Enviando notificação de status '${status}' para o paymentId: ${paymentId}`);
            ws.send(JSON.stringify({ type: 'payment_status', status: status, paymentId: paymentId }));
            
            // Opcional: fechar a conexão e remover do mapa após notificação final
            if (status === 'CONFIRMED' || status === 'RECEIVED' || status === 'OVERDUE') {
                ws.close();
                paymentClients.delete(paymentId);
            }
        }
    }
}

server.listen(PORT, () => {
    // 🎯 MUDANÇA 11: LOG DE INICIALIZAÇÃO CONDICIONAL
    if (!isProduction) {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    } else {
        // Log minimalista apenas para indicar que a aplicação subiu
        console.log(`Servidor iniciado. Ambiente: Produção.`);
    }
});