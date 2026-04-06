const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const bcrypt  = require('bcrypt');

// ✅ pool importado direto — database.js exporta o pool, não connectDB
const pool = require('./database');

const SALT_ROUNDS = 10;
const app  = express();
const port = 8080;

app.use(express.json());
app.use(cors());

// ─── Fallback JSON (usado só se MySQL cair) ───────────────────
const USERS_FILE = path.join(__dirname, 'users.json');

const readUsersJSON = () => {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch {
        return [];
    }
};

const saveUsersJSON = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// =============================================================
//  POST /signup — Cadastro
// =============================================================
app.post('/signup', async (req, res) => {
    const { nome, email, senha } = req.body;

    // ── Validação ─────────────────────────────────────────────
    if (!nome || nome.trim() === '') {
        return res.status(400).json({ success: false, message: 'O nome é obrigatório' });
    }
    if (!email || email.trim() === '') {
        return res.status(400).json({ success: false, message: 'O e-mail é obrigatório' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Formato de e-mail inválido' });
    }
    if (!senha || senha.trim() === '') {
        return res.status(400).json({ success: false, message: 'A senha é obrigatória' });
    }
    if (senha.length < 6) {
        return res.status(400).json({ success: false, message: 'A senha precisa ter pelo menos 6 caracteres' });
    }

    // ── Hash da senha ─────────────────────────────────────────
    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    // ── Tenta salvar no MySQL ─────────────────────────────────
    try {
        // ✅ pool.execute direto — sem connectDB(), sem if(db)
        const [existe] = await pool.execute(
            'SELECT id FROM usuarios WHERE email = ?',
            [email]
        );
        if (existe.length > 0) {
            return res.status(400).json({ success: false, message: 'E-mail já cadastrado' });
        }

        await pool.execute(
            'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
            [nome, email, senhaHash]
        );

        console.log(`✅ Usuário cadastrado no MySQL: ${email}`);
        return res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso!' });

    } catch (err) {
        // ✅ Mostra o erro real no terminal em vez de esconder
        console.log('Erro no MySQL:', err.message);
        console.log('Usando JSON como fallback...');
    }

    // ── Fallback JSON ─────────────────────────────────────────
    const usuarios = readUsersJSON();
    if (usuarios.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'E-mail já cadastrado' });
    }
    usuarios.push({ id: Date.now(), nome, email, senha: senhaHash, role: 'user' });
    saveUsersJSON(usuarios);
    console.log(`⚠️  Usuário salvo no JSON (fallback): ${email}`);
    return res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso!' });
});

// =============================================================
//  POST /login — Login
// =============================================================
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    // ── Validação ─────────────────────────────────────────────
    if (!email || email.trim() === '') {
        return res.status(400).json({ success: false, message: 'O e-mail é obrigatório' });
    }
    if (!senha || senha.trim() === '') {
        return res.status(400).json({ success: false, message: 'A senha é obrigatória' });
    }

    // ── Tenta autenticar pelo MySQL ───────────────────────────
    try {
        // ✅ pool.execute direto — sem connectDB(), sem if(db)
        const [rows] = await pool.execute(
            'SELECT * FROM usuarios WHERE email = ?',
            [email]
        );

        if (rows.length > 0) {
            const usuario = rows[0];
            const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);

            if (senhaCorreta) {
                console.log(`✅ Login MySQL: ${email}`);
                return res.status(200).json({
                    success: true,
                    user: { nome: usuario.nome, email: usuario.email, role: usuario.role },
                    source: 'mysql'
                });
            } else {
                return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos' });
            }
        }

    } catch (err) {
        // ✅ Mostra o erro real
        console.log('Erro no MySQL:', err.message);
        console.log('Tentando JSON como fallback...');
    }

    // ── Fallback JSON ─────────────────────────────────────────
    const usuarios = readUsersJSON();
    const usuario  = usuarios.find(u => u.email === email);

    if (usuario) {
        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (senhaCorreta) {
            console.log(`⚠️  Login via JSON (fallback): ${email}`);
            return res.status(200).json({
                success: true,
                user: { nome: usuario.nome, email: usuario.email, role: usuario.role },
                source: 'json'
            });
        }
    }

    return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos' });
});

// =============================================================
//  POST /traduzir — Tradução
// =============================================================
app.post('/traduzir', (req, res) => {
    const { texto, from, to } = req.body;

    if (!texto || !from || !to) {
        return res.status(400).json({ success: false, message: 'Informe texto, from e to' });
    }

    const dicionario = {
        'pt-guajajara': { 'bom dia': 'Kwez katu', 'terra': 'Ywy', 'água': 'Y' },
        'guajajara-pt': { 'kwez katu': 'Bom dia', 'ywy': 'Terra', 'y': 'Água' }
    };

    const par     = `${from}-${to}`;
    const traducao = dicionario[par]
        ? (dicionario[par][texto.toLowerCase().trim()] || 'Termo não catalogado.')
        : 'Par indisponível.';

    res.json({ original: texto, traduzido: traducao });
});

// =============================================================
//  Inicia o servidor
// =============================================================
app.listen(port, () => {
    console.log(`🌿 Yara API rodando em http://localhost:${port}`);
});