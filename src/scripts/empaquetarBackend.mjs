// Convierte el backend en un único ejecutable para la plataforma actual, usando
// Node SEA (Single Executable Applications). El resultado no necesita Node
// instalado: lleva dentro el propio runtime, el código y las plantillas HTML.
//
//   node src/scripts/empaquetarBackend.mjs
//
// Deja el ejecutable en build/pokeobs-backend (pokeobs-backend.exe en Windows).
//
// Node SEA solo sabe inyectar código en un binario de Node de la misma
// plataforma, así que cada sistema operativo se empaqueta en su propia máquina.
// Para las tres a la vez está el workflow de GitHub Actions.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SALIDA = path.join(RAIZ, 'build');
const PLANTILLAS = path.join(RAIZ, 'src', 'resources', 'html');

const ES_WINDOWS = process.platform === 'win32';
const ES_MACOS = process.platform === 'darwin';
const EJECUTABLE = path.join(SALIDA, ES_WINDOWS ? 'pokeobs-backend.exe' : 'pokeobs-backend');

// Marca que postject busca dentro del binario de Node para saber dónde inyectar.
const CENTINELA = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function paso(texto) {
    console.log(`\n[empaquetar] ${texto}`);
}

function ejecutar(programa, argumentos) {
    // shell en Windows para que resuelva npx.cmd.
    execFileSync(programa, argumentos, { cwd: RAIZ, stdio: 'inherit', shell: ES_WINDOWS });
}

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

// esbuild traduce TypeScript sin comprobar tipos, así que primero se comprueban.
paso('Comprobando tipos');
ejecutar('npx', ['tsc', '--noEmit']);

// Node SEA ejecuta un único script CommonJS, así que todo el backend (código y
// dependencias) se junta en un fichero.
paso('Juntando el backend en un único fichero');
await build({
    entryPoints: [path.join(RAIZ, 'src', 'main.ts')],
    outfile: path.join(SALIDA, 'backend.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    // Aceleradores nativos opcionales de ws: si no están, ws funciona igual.
    external: ['bufferutil', 'utf-8-validate'],
    logLevel: 'warning',
    // import.meta solo se usa en desarrollo (paths.ts) y dentro del ejecutable
    // nunca se evalúa; se silencia el aviso para no ocultar otros.
    logOverride: { 'empty-import-meta': 'silent' },
});

// Las plantillas viajan como assets, con su nombre de fichero como clave: es lo
// que pide leerPlantilla() a node:sea.
paso('Preparando la configuración de Node SEA');
const assets = Object.fromEntries(
    readdirSync(PLANTILLAS)
        .filter(fichero => fichero.endsWith('.html'))
        .map(fichero => [fichero, path.join(PLANTILLAS, fichero)])
);
console.log(`  plantillas incrustadas: ${Object.keys(assets).join(', ')}`);

const configSea = path.join(SALIDA, 'sea-config.json');
writeFileSync(configSea, JSON.stringify({
    main: path.join(SALIDA, 'backend.cjs'),
    output: path.join(SALIDA, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    assets,
}, null, 2));

paso('Generando el blob de la aplicación');
ejecutar(process.execPath, ['--experimental-sea-config', configSea]);

paso(`Copiando el binario de Node ${process.version} (${process.platform}-${process.arch})`);
copyFileSync(process.execPath, EJECUTABLE);
chmodSync(EJECUTABLE, 0o755);

// En macOS el binario de Node viene firmado, y modificarlo invalida la firma:
// se quita antes de inyectar y se vuelve a firmar (en local, sin identidad) después.
if (ES_MACOS) {
    paso('Quitando la firma del binario');
    ejecutar('codesign', ['--remove-signature', EJECUTABLE]);
}

paso('Inyectando el backend en el binario');
ejecutar('npx', [
    'postject', EJECUTABLE, 'NODE_SEA_BLOB', path.join(SALIDA, 'sea-prep.blob'),
    '--sentinel-fuse', CENTINELA,
    ...(ES_MACOS ? ['--macho-segment-name', 'NODE_SEA'] : []),
]);

if (ES_MACOS) {
    paso('Firmando el ejecutable');
    ejecutar('codesign', ['--sign', '-', EJECUTABLE]);
}

paso(`Listo: ${path.relative(RAIZ, EJECUTABLE)}`);
