import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Descarga los iconos de menú (los pixelados que salen en la pantalla de equipo)
// desde el repositorio de sprites de PokeAPI a <carpeta de recursos>/pokemon.
//
// Se nombran por número de Pokédex nacional, que es justo lo que devuelve
// PokemonLeido.especie, así que pokemon/25.png es Pikachu sin traducciones de
// por medio, valga el juego que valga.
//
// Vive en el backend y no como script suelto porque la aplicación empaquetada no
// tiene Node para ejecutarlo: se invoca con el propio ejecutable.
//
// El conjunto "generation-viii" llega hasta el 898 (final de octava generación).
// El de "generation-vii" se queda a mitad de la séptima, y de novena no hay
// iconos en ese repositorio: si algún día se soporta Escarlata/Púrpura habrá que
// buscar otra fuente para el 906 en adelante.

const ULTIMO_POR_DEFECTO = 898;
const CONJUNTO_POR_DEFECTO = 'generation-viii';

// Cuántas descargas a la vez: ni tan pocas que tarde una eternidad ni tantas
// como para que GitHub empiece a cortarnos.
const EN_PARALELO = 8;

type Estado = 'descargado' | 'omitido' | string;

async function yaExiste(ruta: string): Promise<boolean> {
    try {
        await access(ruta);
        return true;
    } catch {
        return false;
    }
}

async function descargar(base: string, destino: string, numero: number): Promise<Estado> {
    const ruta = path.join(destino, `${numero}.png`);

    // Reanudable y respetuoso: lo que ya está no se vuelve a pedir, así que si se
    // corta a medias basta con relanzarlo y no se pisan imágenes personalizadas.
    if (await yaExiste(ruta)) {
        return 'omitido';
    }

    try {
        const respuesta = await fetch(`${base}/${numero}.png`);

        if (!respuesta.ok) {
            return `error ${respuesta.status}`;
        }

        await writeFile(ruta, Buffer.from(await respuesta.arrayBuffer()));
        return 'descargado';
    } catch (error) {
        // Sin conexión, DNS caído, etc. Se recoge como fallo en vez de reventar.
        const causa = (error as { cause?: { code?: string } }).cause?.code;
        return `sin conexión (${causa ?? (error as Error).message})`;
    }
}

export async function descargarSprites(
    carpetaRecursos: string,
    ultimo = ULTIMO_POR_DEFECTO,
    conjunto = CONJUNTO_POR_DEFECTO,
): Promise<void> {
    const destino = path.join(carpetaRecursos, 'pokemon');
    const base = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/${conjunto}/icons`;

    await mkdir(destino, { recursive: true });

    const numeros = Array.from({ length: ultimo }, (_, i) => i + 1);
    const resumen = { descargado: 0, omitido: 0 };
    const fallos: string[] = [];

    // Por tandas, para no lanzar cientos de peticiones de golpe.
    for (let i = 0; i < numeros.length; i += EN_PARALELO) {
        const tanda = numeros.slice(i, i + EN_PARALELO);

        const resultados = await Promise.all(tanda.map(async numero => ({
            numero,
            estado: await descargar(base, destino, numero),
        })));

        resultados.forEach(({ numero, estado }) => {
            if (estado === 'descargado' || estado === 'omitido') {
                resumen[estado]++;
            } else {
                fallos.push(`${numero}: ${estado}`);
            }
        });

        const hechos = Math.min(i + EN_PARALELO, ultimo);

        if (process.stdout.isTTY) {
            // En terminal, barra que se reescribe sobre sí misma.
            process.stdout.write(`\r${hechos}/${ultimo}`);
        } else if (resumen.descargado > 0 && hechos % 100 < EN_PARALELO) {
            // Por tubería (la GUI) no vale el \r: una línea de vez en cuando,
            // que si no la descarga parece colgada durante medio minuto.
            console.log(`[sprites] ${hechos}/${ultimo}`);
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
        console.log(`[sprites] Faltan sprites en ${destino}. Se puede volver a lanzar la descarga para reintentar.`);
    }
}
