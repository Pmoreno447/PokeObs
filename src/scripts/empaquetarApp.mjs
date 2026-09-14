// Monta el paquete distribuible de la plataforma actual: la GUI, sus recursos y
// el ejecutable del backend, listo para descargar y abrir.
//
//   node src/scripts/empaquetarApp.mjs
//
// Necesita antes:
//   - la GUI compilada (neu build en pokeobs-gui/)
//   - el backend empaquetado (src/scripts/empaquetarBackend.mjs)
//
// Resultado en release/:
//   macOS    PokeObs-macos-<arq>.zip      con PokeObs.app dentro
//   Windows  PokeObs-windows-<arq>.zip    carpeta con PokeObs.exe
//   Linux    PokeObs-linux-<arq>.tar.gz   carpeta con PokeObs
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUI_COMPILADA = path.join(RAIZ, 'pokeobs-gui', 'dist', 'pokeobs-gui');
const SALIDA = path.join(RAIZ, 'release');

const { version } = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf-8'));
const { applicationId } = JSON.parse(readFileSync(path.join(RAIZ, 'pokeobs-gui', 'neutralino.config.json'), 'utf-8'));

// Nombre que usa neu build para cada binario de la GUI, y cómo lo llamamos
// nosotros en el paquete.
const PLATAFORMAS = {
    'darwin-arm64': { so: 'macos', gui: 'pokeobs-gui-mac_arm64' },
    'darwin-x64': { so: 'macos', gui: 'pokeobs-gui-mac_x64' },
    'win32-x64': { so: 'windows', gui: 'pokeobs-gui-win_x64.exe' },
    'linux-x64': { so: 'linux', gui: 'pokeobs-gui-linux_x64' },
    'linux-arm64': { so: 'linux', gui: 'pokeobs-gui-linux_arm64' },
};

const clave = `${process.platform}-${process.arch}`;
const plataforma = PLATAFORMAS[clave];

if (!plataforma) {
    console.error(`[paquete] Plataforma no soportada: ${clave}`);
    process.exit(1);
}

const ES_WINDOWS = plataforma.so === 'windows';
const NOMBRE = `PokeObs-${plataforma.so}-${process.arch}`;

const origen = {
    gui: path.join(GUI_COMPILADA, plataforma.gui),
    recursos: path.join(GUI_COMPILADA, 'resources.neu'),
    backend: path.join(RAIZ, 'build', ES_WINDOWS ? 'pokeobs-backend.exe' : 'pokeobs-backend'),
    icono: path.join(RAIZ, 'pokeobs-gui', 'AppIcon.icns'),
};

for (const [pieza, ruta] of Object.entries(origen)) {
    if (pieza === 'icono' && plataforma.so !== 'macos') {
        continue;
    }

    if (!existsSync(ruta)) {
        console.error(`[paquete] Falta ${pieza}: ${path.relative(RAIZ, ruta)}. Ejecuta antes "npm run empaquetar".`);
        process.exit(1);
    }
}

function paso(texto) {
    console.log(`[paquete] ${texto}`);
}

function ejecutar(programa, argumentos, cwd = SALIDA) {
    execFileSync(programa, argumentos, { cwd, stdio: 'inherit' });
}

// Copia las tres piezas juntas: la GUI busca resources.neu y el backend en su
// propia carpeta.
function copiarPiezas(destino, nombreGui) {
    mkdirSync(destino, { recursive: true });
    copyFileSync(origen.gui, path.join(destino, nombreGui));
    copyFileSync(origen.recursos, path.join(destino, 'resources.neu'));
    copyFileSync(origen.backend, path.join(destino, path.basename(origen.backend)));

    if (!ES_WINDOWS) {
        chmodSync(path.join(destino, nombreGui), 0o755);
        chmodSync(path.join(destino, path.basename(origen.backend)), 0o755);
    }
}

// Un .app es una carpeta con una estructura fija que el Finder muestra como un
// único programa. El Info.plist le dice qué ejecutable abrir y qué icono usar.
function montarAppMacos(carpeta) {
    const app = path.join(carpeta, 'PokeObs.app');
    const contenido = path.join(app, 'Contents');

    copiarPiezas(path.join(contenido, 'MacOS'), 'PokeObs');

    mkdirSync(path.join(contenido, 'Resources'), { recursive: true });
    copyFileSync(origen.icono, path.join(contenido, 'Resources', 'AppIcon.icns'));

    writeFileSync(path.join(contenido, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>PokeObs</string>
    <key>CFBundleDisplayName</key>
    <string>PokeObs</string>
    <key>CFBundleIdentifier</key>
    <string>${applicationId}</string>
    <key>CFBundleVersion</key>
    <string>${version}</string>
    <key>CFBundleShortVersionString</key>
    <string>${version}</string>
    <key>CFBundleExecutable</key>
    <string>PokeObs</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
`);

    // Firma local (sin identidad de desarrollador) de todo el bundle, para que
    // macOS acepte ejecutarlo en arm64. No evita el aviso de "desarrollador no
    // identificado" al descargarlo: eso requiere una cuenta de Apple.
    paso('Firmando PokeObs.app');
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });

    return app;
}

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

const carpeta = path.join(SALIDA, NOMBRE);
paso(`Montando ${NOMBRE} (versión ${version})`);

if (plataforma.so === 'macos') {
    const app = montarAppMacos(carpeta);

    // ditto conserva permisos, enlaces y la firma del .app, cosa que un zip
    // genérico no garantiza.
    paso('Comprimiendo');
    ejecutar('ditto', ['-c', '-k', '--keepParent', app, `${NOMBRE}.zip`]);
} else if (ES_WINDOWS) {
    copiarPiezas(carpeta, 'PokeObs.exe');

    paso('Comprimiendo');
    ejecutar('powershell', [
        '-NoProfile', '-Command',
        `Compress-Archive -Path '${carpeta}' -DestinationPath '${path.join(SALIDA, `${NOMBRE}.zip`)}' -Force`,
    ]);
} else {
    copiarPiezas(carpeta, 'PokeObs');

    // tar.gz y no zip: conserva el permiso de ejecución, que en Linux es
    // imprescindible para poder abrir los binarios.
    paso('Comprimiendo');
    ejecutar('tar', ['-czf', `${NOMBRE}.tar.gz`, NOMBRE]);
}

paso(`Listo en ${path.relative(RAIZ, SALIDA)}/`);
