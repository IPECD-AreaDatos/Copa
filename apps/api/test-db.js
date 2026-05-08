const db = require('./db');

async function testQuery() {
    try {
        const result = await db.query(
            `SELECT username, tablero_acceso 
             FROM public.usuarios_tableros 
             WHERE username = $1`,
            ['jpvaldes']
        );
        
        if (result.rows.length > 0) {
            console.log('USUARIO ENCONTRADO:', result.rows[0]);
        } else {
            console.log('Usuario jpvaldes no encontrado en la DB.');
            
            // List some users to see what's there
            const allUsers = await db.query(
                `SELECT username, tablero_acceso, activo 
                 FROM public.usuarios_tableros 
                 LIMIT 5`
            );
            console.log('Muestra de usuarios en DB:', allUsers.rows);
        }
    } catch (err) {
        console.error('ERROR CONECTANDO A LA DB:', err.message);
    } finally {
        process.exit();
    }
}

testQuery();
