// Algoritmo de descifrado de datos de Pokémon en memoria para juegos de Gen 6/7
// (Pokémon X/Y, Omega Ruby/Alpha Sapphire, Sol/Luna, Ultra Sol/Ultra Luna).
//
// El juego cifra cada bloque de datos de Pokémon con un LCG (generador congruencial
// lineal) semillado con el PID del propio Pokémon, y además desordena 4 sub-bloques
// de 56 bytes entre sí. Es el mismo esquema que se usa desde Gen 4/5 para proteger
// los datos del Pokémon en el guardado/memoria.
//
// Portado desde la implementación de referencia de EverOddish (PokeStreamer-Tools,
// gen_6_7/auto_layout_gen6_gen7.py): https://github.com/EverOddish/PokeStreamer-Tools
// que a su vez inspiró la versión en JS del proyecto Pokemon-Stream-Tool de Readek:
// https://github.com/Readek/Pokemon-Stream-Tool

const BLOCK_SIZE = 56;

// Posiciones de los 4 sub-bloques de 56 bytes, indexadas por el "shuffle value" (0-23).
// Cada fila es el bloque de destino; cada columna (0-23) es el shuffle value.
const BLOCK_POSITIONS: number[][] = [
    [0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3],
    [1, 1, 2, 3, 2, 3, 0, 0, 0, 0, 0, 0, 2, 3, 1, 1, 3, 2, 2, 3, 1, 1, 3, 2],
    [2, 3, 1, 1, 3, 2, 2, 3, 1, 1, 3, 2, 0, 0, 0, 0, 0, 0, 3, 2, 3, 2, 1, 1],
    [3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0],
];

/**
 * Descifra un rango [start, end) de `data`, avanzando la semilla LCG de 2 en 2 bytes.
 * La multiplicación de la semilla se sale del rango seguro de Number, por eso se opera
 * en BigInt y se vuelve a Number solo para los desplazamientos de bits finales.
 */
function cryptRange(data: Buffer, seed: number, start: number, end: number): Buffer {
    const result = Buffer.alloc(end - start);
    let tempSeed = BigInt(seed);

    for (let i = start; i < end; i += 2) {
        tempSeed = (tempSeed * 0x41c64e6dn) & 0xffffffffn;
        tempSeed = (tempSeed + 0x00006073n) & 0xffffffffn;

        const seedNum = Number(tempSeed);
        const outIndex = i - start;

        result[outIndex] = data[i] ^ ((seedNum >> 16) & 0xff);
        result[outIndex + 1] = data[i + 1] ^ ((seedNum >> 24) & 0xff);
    }

    return result;
}

/** Reordena los 4 sub-bloques de 56 bytes según el shuffle value (sv). */
function shuffleBlocks(data: Buffer, sv: number): Buffer {
    const result = Buffer.alloc(data.length);

    for (let block = 0; block < 4; block++) {
        const sourceBlock = BLOCK_POSITIONS[block][sv];
        const start = BLOCK_SIZE * sourceBlock;
        const end = start + BLOCK_SIZE;

        data.copy(result, block * BLOCK_SIZE, start, end);
    }

    return result;
}

/**
 * Descifra el bloque de datos crudo de un Pokémon (232 bytes de "party data" +
 * 22 bytes de "stats", los mismos que devuelve readMemory concatenados).
 * Devuelve null si el slot está vacío (byte 0 a 0) o si el tamaño no encaja.
 */
export function decryptPokemonData(encryptedData: Buffer): Buffer | null {
    if (encryptedData.length < 8 + 4 * BLOCK_SIZE) {
        return null;
    }

    const pv = encryptedData.readUInt32LE(0);

    // Una entrada libre tiene el PID entero a 0 y no hay nada que descifrar. Se
    // comprueban los cuatro bytes y no solo el primero: un Pokémon real puede
    // tener un PID que acabe en 0x00 y desaparecería del overlay.
    if (pv === 0) {
        return null;
    }

    const sv = ((pv >> 0xd) & 0x1f) % 24;

    const start = 8;
    const end = 4 * BLOCK_SIZE + start;

    const header = encryptedData.subarray(0, 8);
    const blocks = cryptRange(encryptedData, pv, start, end);
    const stats = cryptRange(encryptedData, pv, end, encryptedData.length);

    return Buffer.concat([header, shuffleBlocks(blocks, sv), stats]);
}
