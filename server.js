// server.js
import express from 'express';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ===== Corrige __dirname em ESModules =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Carrega variáveis de ambiente =====
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middlewares =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== Servir arquivos estáticos (index.html, css/, js/, img/, etc.) =====
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
// ROTA DA API: criar pagamento
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

    console.log('RESPOSTA INICIAL DA CRIAÇÃO:', JSON.stringify(paymentData, null, 2));

    if (!paymentResponse.ok) {
      console.error('Erro da API Asaas ao criar pagamento:', paymentData);
      return res.status(400).json({ error: 'Erro ao criar pagamento', details: paymentData.errors || paymentData });
    }

    // 6) Se for PIX, buscar QR Code extra
    if (paymentData.billingType === 'PIX' && paymentData.id) {
      console.log(`Pagamento PIX criado com ID: ${paymentData.id}. Buscando QR Code...`);
      const getQrCodeResponse = await asaasAPI(`/payments/${paymentData.id}/pixQrCode`);
      const qrCodeData = await getQrCodeResponse.json();

      console.log('RESPOSTA DA BUSCA PELO QR CODE:', JSON.stringify(qrCodeData, null, 2));

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

// ========================
// Roteamento automático para qualquer .html da raiz
// (deve vir APÓS as rotas /api)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/:page', (req, res, next) => {
  // evita interceptar rotas de API e caminhos de arquivo profundo
  const page = req.params.page;
  if (page.startsWith('api') || page.includes('.')) return next();

  const filePath = path.join(__dirname, `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

// ===== Middleware 404 =====
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'), (err) => {
    if (err) res.status(404).send('<h1>404 - Página não encontrada</h1>');
  });
});

// ===== Inicializar servidor =====
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
