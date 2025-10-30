// js/firebase-config.js

/**
 * =================================================================
 *  ARQUIVO DE CONFIGURAÇÃO DO FIREBASE
 * =================================================================
 * Este arquivo inicializa a conexão com o Firebase e exporta
 * as instâncias dos serviços que serão usados em todo o aplicativo.
 * 
 * - Cloud Firestore: Usado para usuários, pedidos, cupons,
 *   e agora também para produtos e anúncios. É o banco de dados
 *   principal para dados estruturados.
 * 
 * - Realtime Database: Mantido para funcionalidades específicas
 *   como o sistema de personalizações, que já está implementado
 *   usando este serviço.
 * 
 * Certifique-se de que suas chaves de API e configurações de projeto
 * estão corretas. Lembre-se que estas chaves são publicamente visíveis
 * e a segurança dos seus dados deve ser garantida através das
 * Regras de Segurança no console do Firebase.
 * =================================================================
 */

// Importe as funções de inicialização e dos serviços que você precisa
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Suas credenciais de configuração do Firebase para este projeto web
// Estas credenciais podem ser encontradas no seu Console do Firebase:
// Configurações do Projeto > Geral > Seus apps > App da Web
const firebaseConfig = {
  apiKey: "AIzaSyBhp9R0wIARZK2x5QPxgnLds9S34wrxlRY",
  authDomain: "delivery-6f695.firebaseapp.com",
  projectId: "delivery-6f695",
  storageBucket: "delivery-6f695.firebasestorage.app",
  messagingSenderId: "184156408750",
  appId: "1:184156408750:web:8725cda543b6690d20563f",
  measurementId: "G-VTM7QBJ3TY"
};


// Inicializa o Firebase com as configurações fornecidas
const app = initializeApp(firebaseConfig);

// Obtém uma instância de cada serviço do Firebase que será utilizado no projeto
const database = getDatabase(app);     // Conexão com o Realtime Database
const firestore = getFirestore(app);   // Conexão com o Cloud Firestore
const storage = getStorage(app);       // Conexão com o Firebase Storage

// Exporta as instâncias para que possam ser importadas e utilizadas
// em outros arquivos JavaScript do projeto (ex: auth.js, cardapio.js, etc.)
export { database, firestore, storage };