// Descarga los iconos de menú (los pixelados que salen en la pantalla de equipo)
// desde el repositorio de sprites de PokeAPI a src/resources/img/sprites.
//
//   node src/scripts/descargarSprites.mjs [ultimo] [conjunto]
//
// Se nombran por número de Pokédex nacional, que es justo lo que devuelve
// PokemonLeido.especie, así que /img/sprites/25.png es Pikachu sin traducciones
// de por medio, valga el juego que valga.
//
// El conjunto "generation-viii" llega hasta el 898 (final de octava generación).
// El de "generation-vii" se queda a mitad de la séptima, y de novena no hay
// iconos en ese repositorio: si algún día se soporta Escarlata/Púrpura habrá que
// buscar otra fuente para el 906 en adelante.
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// La raíz se busca subiendo hasta encontrar el package.json en vez de contar
// carpetas hacia arriba: así el script sigue funcionando lo muevas donde lo
// muevas dentro del proyecto.
function buscarRaiz(desde) {
    let actual = desde;

    while (!existsSync(path.join(actual, 'package.json'))) {
        const padre = path.dirname(actual);

        if (padre === actual) {
            throw new Error('No encuentro la raíz del proyecto (falta package.json)');
        }

        actual = padre;
    }

    return actual;
}

const RAIZ = buscarRaiz(__dirname);
const RUTA_CONFIG = path.join(RAIZ, 'src', 'config', 'userConfig', 'userConfig.json');

// Los iconos van a la carpeta de imágenes del usuario, la misma que sirve el
// servidor HTTP. La aplicación no los empaqueta: es una ayuda para poblarla.
const config = JSON.parse(await readFile(RUTA_CONFIG, 'utf-8'));

// La GUI pasa la carpeta con --destino para poder descargar sin obligar antes a
// guardar la configuración; desde la terminal se toma la ya configurada.
const argumentos = process.argv.slice(2);
const destinoIndicado = argumentos.find(a => a.startsWith('--destino='))?.slice('--destino='.length);
const posicionales = argumentos.filter(a => !a.startsWith('--'));
const raiz = destinoIndicado || config.rutaRecursos;

if (!raiz) {
    console.log('[sprites] No hay carpeta de imágenes configurada. Elígela en la GUI y vuelve a lanzarlo.');
    process.exit(0);
}

const DESTINO = path.join(raiz, 'pokemon');

const ULTIMO = Number(posicionales[0] ?? 898);
const CONJUNTO = posicionales[1] ?? 'generation-viii';
const BASE = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/${CONJUNTO}/icons`;

// Cuántas descargas a la vez: ni tan pocas que tarde una eternidad ni tantas
// como para que GitHub empiece a cortarnos.
const EN_PARALELO = 8;

async function yaExiste(ruta) {
    try {
        await access(ruta);
        return true;
    } catch {
        return false;
    }
}

async function descargar(numero) {
    const ruta = path.join(DESTINO, `${numero}.png`);

    // Reanudable: lo que ya está no se vuelve a pedir, así que si se corta a
    // medias basta con volver a lanzarlo.
    if (await yaExiste(ruta)) {
        return 'omitido';
    }

    try {
        const respuesta = await fetch(`${BASE}/${numero}.png`);

        if (!respuesta.ok) {
            return `error ${respuesta.status}`;
        }

        await writeFile(ruta, Buffer.from(await respuesta.arrayBuffer()));
        return 'descargado';
    } catch (error) {
        // Sin conexión, DNS caído, etc. Se recoge como fallo en vez de reventar:
        // esto corre dentro de npm run build y quedarse sin sprites no debe
        // impedir compilar.
        return `sin conexión (${error.cause?.code ?? error.message})`;
    }
}

async function main() {
    await mkdir(DESTINO, { recursive: true });

    const numeros = Array.from({ length: ULTIMO }, (_, i) => i + 1);
    const resumen = { descargado: 0, omitido: 0 };
    const fallos = [];

    // Por tandas, para no lanzar 898 peticiones de golpe.
    for (let i = 0; i < numeros.length; i += EN_PARALELO) {
        const tanda = numeros.slice(i, i + EN_PARALELO);

        const resultados = await Promise.all(tanda.map(async numero => ({
            numero,
            estado: await descargar(numero),
        })));

        resultados.forEach(({ numero, estado }) => {
            if (estado in resumen) {
                resumen[estado]++;
            } else {
                fallos.push(`${numero}: ${estado}`);
            }
        });

        const hechos = Math.min(i + EN_PARALELO, ULTIMO);

        if (process.stdout.isTTY) {
            // En terminal, barra que se reescribe sobre sí misma.
            process.stdout.write(`\r${hechos}/${ULTIMO}`);
        } else if (resumen.descargado > 0 && hechos % 100 < EN_PARALELO) {
            // Por tubería (la GUI) no vale el \r: una línea de vez en cuando,
            // que si no la descarga parece colgada durante medio minuto.
            console.log(`[sprites] ${hechos}/${ULTIMO}`);
        }
    }

    if (process.stdout.isTTY) {
        process.stdout.write('\r');
    }

    // Si no había nada que hacer no se dice nada, para no ensuciar cada build.
    if (resumen.descargado === 0 && fallos.length === 0) {
        return;
    }

    console.log(`[sprites] Descargados ${resumen.descargado}, ya estaban ${resumen.omitido}, fallidos ${fallos.length}`);
    fallos.slice(0, 5).forEach(fallo => console.log(`  ${fallo}`));

    if (fallos.length > 0) {
        console.log(`[sprites] Faltan sprites en ${DESTINO}. Se puede reintentar con: npm run sprites`);
    }
}

main();