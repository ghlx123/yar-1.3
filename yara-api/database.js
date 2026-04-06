const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host    : 'localhost',
  user    : 'root',
  password: '',
  database: 'yara_db',
  port    : 3307,
  waitForConnections: true,
  connectionLimit   : 10,
  queueLimit        : 0
});

pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL conectado — yara_db');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar no MySQL:', err.message);
  });

module.exports = pool;  // ← essa linha é a chave