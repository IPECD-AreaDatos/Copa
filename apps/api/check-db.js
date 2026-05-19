const db = require('./db');

async function checkUsers() {
  try {
    const data = await db.query(`SELECT id_usuario, username, tablero_acceso, activo FROM public.usuarios_tableros;`);
    console.table(data.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
checkUsers();
