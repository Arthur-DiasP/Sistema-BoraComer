/**
 * =================================================================
 *  LÓGICA DE AUTENTICAÇÃO E CADASTRO (auth.js)
 * =================================================================
 * Este script gerencia os formulários de login e cadastro.
 * - Conecta-se ao Cloud Firestore para validar e salvar dados de usuários.
 * - Lida com a lógica de login do administrador.
 * - Realiza todas as validações de campo do lado do cliente.
 * - Ao logar, salva os dados completos do usuário no sessionStorage.
 * - Inicializa novos usuários com 2 chances para o jogo do cupom.
 * - Captura e armazena códigos de referência (indicação).
 * =================================================================
 */

// Importa o serviço do Firestore a partir do nosso arquivo de configuração
import { firestore } from './firebase-config.js';
import { collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Função auxiliar para exibir mensagens de erro de forma consistente nos formulários.
 * @param {HTMLElement} formElement - O elemento do formulário onde o erro ocorreu.
 * @param {string} message - A mensagem de erro a ser exibida.
 */
function showFormError(formElement, message) {
    const errorElement = formElement.querySelector('.error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

// ==================================================
// --- SEÇÃO DE LOGIN ---
// ==================================================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    // Captura o código de referência da URL, se existir
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
        sessionStorage.setItem('referralCode', refCode);
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;
        const errorElement = loginForm.querySelector('.error-message');
        if(errorElement) errorElement.style.display = 'none'; // Esconde erros antigos

        // Limpa a sessão anterior antes de tentar um novo login
        sessionStorage.clear();

        // 1. Validação de Administrador (Hardcoded)
        if (email === 'teste@gmail.com' && senha === '111111') {
            alert('Login de administrador bem-sucedido!');
            sessionStorage.setItem('userRole', 'admin');
            window.location.href = 'dashboard.html';
            return;
        }

        // 2. Validação de Usuário Comum (via Firestore)
        try {
            const usersRef = collection(firestore, 'users');
            const q = query(usersRef, where("email", "==", email));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                showFormError(loginForm, 'Email não encontrado. Verifique ou cadastre-se.');
                return;
            }

            let userFound = false;
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                if (userData.senha === senha) {
                    userFound = true;
                    alert('Login bem-sucedido!');

                    // Salva todos os dados relevantes do usuário na sessão
                    const loggedInUser = {
                        id: doc.id,
                        nome: userData.nome,
                        email: userData.email,
                        telefone: userData.telefone,
                        cpf: userData.cpf,
                        // Adiciona os saldos e tickets à sessão
                        referralCredit: userData.referralCredit || 0,
                        cashbackBalance: userData.cashbackBalance || 0,
                        firstPurchaseDiscountUsed: userData.firstPurchaseDiscountUsed || false,
                    };

                    sessionStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
                    sessionStorage.setItem('userRole', 'user');
                    sessionStorage.setItem('userId', doc.id);
                    
                    window.location.href = 'cardapio.html';
                }
            });

            if (!userFound) {
                showFormError(loginForm, 'Senha incorreta. Tente novamente.');
            }

        } catch (error) {
            console.error("Erro ao fazer login: ", error);
            showFormError(loginForm, 'Erro no servidor. Tente novamente mais tarde.');
        }
    });
}


// ==================================================
// --- SEÇÃO DE CADASTRO ---
// ==================================================
const cadastroForm = document.getElementById('cadastroForm');
if (cadastroForm) {
    // =========================================================================
    //  INÍCIO DA ATUALIZAÇÃO: Máscara de telefone corrigida e inteligente
    // =========================================================================
    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) {
        telefoneInput.addEventListener('input', (e) => {
            let digits = e.target.value.replace(/\D/g, '');

            // Adiciona o "+55" automaticamente se o usuário começar a digitar o DDD
            if (digits.length >= 2 && digits.substring(0, 2) !== '55') {
                digits = '55' + digits;
            }

            digits = digits.slice(0, 13);

            // Reconstrói a string formatada, permitindo apagar
            if (digits.length <= 2) {
                e.target.value = `+${digits}`;
            } else if (digits.length <= 4) {
                e.target.value = `+${digits.slice(0, 2)} (${digits.slice(2)}`;
            } else if (digits.length <= 9) {
                e.target.value = `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4)}`;
            } else {
                e.target.value = `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
            }
        });
    }
    // =========================================================================
    //  FIM DA ATUALIZAÇÃO
    // =========================================================================

    const cpfInput = document.getElementById('cpf');
    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.slice(0, 11);
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
            value = value.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
            e.target.value = value;
        });
    }

    cadastroForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorElement = cadastroForm.querySelector('.error-message');
        if(errorElement) errorElement.style.display = 'none';

        const nomeCompleto = document.getElementById('nomeCompleto').value.trim();
        const telefone = document.getElementById('telefone').value;
        const cpf = document.getElementById('cpf').value;
        const email = document.getElementById('email').value.trim();
        const dataNascimento = document.getElementById('dataNascimento').value;
        const senha = document.getElementById('senha').value;
        const confirmarSenha = document.getElementById('confirmarSenha').value;

        // --- VALIDAÇÕES ---
        if (!/^[A-Za-zÀ-ú\s]{3,}$/.test(nomeCompleto)) {
            showFormError(cadastroForm, 'Nome completo deve conter apenas letras e ter no mínimo 3 caracteres.');
            return;
        }
        
        // A validação de telefone agora verifica o número de dígitos puros
        if (telefone.replace(/\D/g, '').length < 12) { // 55 + DDD + 9 dígitos = 13 dígitos
            showFormError(cadastroForm, 'Telefone inválido. Preencha o código do país (55), DDD e número completo.');
            return;
        }

        if (cpf.replace(/\D/g, '').length !== 11) {
            showFormError(cadastroForm, 'CPF inválido. Deve conter exatamente 11 dígitos.');
            return;
        }
        if (senha !== confirmarSenha) {
            showFormError(cadastroForm, 'As senhas não coincidem!');
            return;
        }
        if (!/^\d{6}$/.test(senha)) {
            showFormError(cadastroForm, 'A senha deve ter exatamente 6 dígitos numéricos.');
            return;
        }
        const hoje = new Date();
        const nascimento = new Date(dataNascimento);
        let idade = hoje.getFullYear() - nascimento.getFullYear();
        const m = hoje.getMonth() - nascimento.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
            idade--;
        }
        if (idade < 16) {
            showFormError(cadastroForm, 'Você precisa ter no mínimo 16 anos para se cadastrar.');
            return;
        }

        try {
            const qEmail = query(collection(firestore, 'users'), where("email", "==", email));
            const emailSnapshot = await getDocs(qEmail);
            if (!emailSnapshot.empty) {
                showFormError(cadastroForm, 'Este email já está cadastrado. Tente fazer login.');
                return;
            }

            const qCpf = query(collection(firestore, 'users'), where("cpf", "==", cpf));
            const cpfSnapshot = await getDocs(qCpf);
            if (!cpfSnapshot.empty) {
                showFormError(cadastroForm, 'Este CPF já está cadastrado em outra conta.');
                return;
            }

            const newUser = {
                nome: nomeCompleto,
                telefone: telefone,
                cpf: cpf,
                email: email,
                dataNascimento: dataNascimento,
                senha: senha,
                // NOVOS CAMPOS PARA O ECOSSISTEMA
                referralCredit: 0,
                cashbackBalance: 0,
                successfulReferrals: []
            };
            
            // Adiciona o código de referência se existir
            const refCode = sessionStorage.getItem('referralCode');
            if (refCode) {
                newUser.referredBy = refCode;
            }

            await addDoc(collection(firestore, 'users'), newUser);
            
            // Limpa o código de referência da sessão após o uso
            sessionStorage.removeItem('referralCode');

            alert('Cadastro realizado com sucesso! Você será redirecionado para a página de login.');
            window.location.href = 'login.html';

        } catch (error) {
            console.error("Erro ao cadastrar: ", error);
            showFormError(cadastroForm, 'Ocorreu um erro no servidor. Tente novamente.');
        }
    });
}