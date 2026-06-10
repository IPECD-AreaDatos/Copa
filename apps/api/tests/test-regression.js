const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..', '..');
const apiRoot = path.join(__dirname, '..');
const getKpisScript = path.join(__dirname, 'get-kpis.js');

function diff(obj1, obj2, path = '') {
    const diffs = [];
    if (obj1 === obj2) return diffs;

    if (typeof obj1 !== typeof obj2) {
        diffs.push(`${path}: type changed from ${typeof obj1} to ${typeof obj2}`);
        return diffs;
    }

    if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) {
        if (typeof obj1 === 'number' && typeof obj2 === 'number') {
            if (Math.abs(obj1 - obj2) > 1e-5) {
                diffs.push(`${path}: value changed from ${obj1} to ${obj2}`);
            }
        } else {
            diffs.push(`${path}: value changed from ${JSON.stringify(obj1)} to ${JSON.stringify(obj2)}`);
        }
        return diffs;
    }

    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
        diffs.push(`${path}: type changed (Array mismatch)`);
        return diffs;
    }

    if (Array.isArray(obj1)) {
        if (obj1.length !== obj2.length) {
            diffs.push(`${path}: array length changed from ${obj1.length} to ${obj2.length}`);
            return diffs;
        }
        for (let i = 0; i < obj1.length; i++) {
            diffs.push(...diff(obj1[i], obj2[i], `${path}[${i}]`));
        }
        return diffs;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    for (const key of keys1) {
        if (!(key in obj2)) {
            diffs.push(`${path}.${key}: removed key`);
        } else {
            diffs.push(...diff(obj1[key], obj2[key], path ? `${path}.${key}` : key));
        }
    }

    for (const key of keys2) {
        if (!(key in obj1)) {
            diffs.push(`${path}.${key}: added key`);
        }
    }

    return diffs;
}

function parseJSONOutput(rawText) {
    const lines = rawText.split('\n');
    const cleanLines = lines.filter(line => !line.trim().startsWith('◇'));
    const cleanText = cleanLines.join('\n');
    return JSON.parse(cleanText);
}

async function main() {
    let currentBranch = '';
    try {
        currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch (err) {
        console.error('Error al detectar la rama git actual:', err.message);
        process.exit(1);
    }

    let currentKpis;
    try {
        console.log(`[1/5] Extrayendo KPIs de 2024 en la rama actual (${currentBranch})...`);
        const currentKpisRaw = execSync(`node "${getKpisScript}"`, { cwd: apiRoot, encoding: 'utf8' });
        currentKpis = parseJSONOutput(currentKpisRaw);
    } catch (err) {
        console.error('Error al extraer KPIs en la rama actual:', err.message);
        process.exit(1);
    }

    let stashed = false;
    try {
        const status = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8' }).trim();
        if (status) {
            const hasTrackedChanges = status.split('\n').some(line => line.trim() && !line.trim().startsWith('??'));
            if (hasTrackedChanges) {
                console.log('Guardando cambios locales temporales en git stash...');
                execSync('git stash', { cwd: repoRoot });
                stashed = true;
            }
        }
    } catch (err) {
        console.error('Error al intentar hacer stash:', err.message);
        process.exit(1);
    }

    let mainKpis;
    try {
        console.log('[2/5] Cambiando temporalmente a la rama main...');
        execSync('git checkout main', { cwd: repoRoot });

        console.log('[3/5] Extrayendo KPIs de 2024 en la rama main...');
        const mainKpisRaw = execSync(`node "${getKpisScript}"`, { cwd: apiRoot, encoding: 'utf8' });
        mainKpis = parseJSONOutput(mainKpisRaw);
    } catch (err) {
        console.error('Error al extraer KPIs en la rama main:', err.message);
    } finally {
        console.log(`[4/5] Volviendo a la rama original (${currentBranch})...`);
        try {
            execSync(`git checkout ${currentBranch}`, { cwd: repoRoot });
        } catch (checkoutErr) {
            console.error(`¡ERROR CRÍTICO! No se pudo volver a la rama original ${currentBranch}:`, checkoutErr.message);
            process.exit(1);
        }

        if (stashed) {
            console.log('Restaurando cambios locales desde git stash...');
            try {
                execSync('git stash pop', { cwd: repoRoot });
            } catch (popErr) {
                console.error('Advertencia: No se pudo restaurar el stash de manera limpia:', popErr.message);
            }
        }
    }

    if (!mainKpis) {
        console.error('No se pudieron comparar los KPIs porque la extracción en la rama main falló.');
        process.exit(1);
    }

    console.log('[5/5] Comparando KPIs de 2024...');
    const differences = diff(currentKpis, mainKpis);
    if (differences.length === 0) {
        console.log('\x1b[32m%s\x1b[0m', '✓ ÉXITO: Los KPIs del año 2024 son idénticos entre ambas ramas.');
        process.exit(0);
    } else {
        console.error('\x1b[31m%s\x1b[0m', '✗ FALLO: Se detectaron diferencias en los KPIs del 2024:');
        differences.forEach(d => console.error(`  - ${d}`));
        process.exit(1);
    }
}

main();
