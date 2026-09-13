import { readMemory } from '../azaharConnection.js';
import { GameModule, PokemonLeido } from '../../gameModule.js';
import { decryptPokemonData } from '../azaharUtils.js';

export type VersionXY = "1.0" | "1.1";

// Direcciones de memoria y desplazamientos propios de cada versión del juego.
//
// "medallas" es una dirección absoluta de memoria del emulador; el resto son
// desplazamientos dentro del bloque de datos de un Pokémon ya descifrado. Hoy
// esos desplazamientos coinciden en 1.0 y 1.1, pero se declaran por versión
// igual que la dirección de medallas: si en algún parche se mueven, solo hay que
// cambiar la fila, no el código que los lee.
export interface DireccionesXY {
    medallas: number;

    // El equipo NO es un array de datos consecutivos. Los Pokémon viven en un
    // "pool" que reutiliza entradas liberadas (al quitar uno del equipo su hueco
    // queda libre y lo ocupa el siguiente que entre), así que la posición dentro
    // del pool no dice nada del orden de pantalla. El orden real está en esta
    // tabla de 6 punteros de 4 bytes: tablaEquipo[slot] apunta a la entrada del
    // pool, y los datos del Pokémon empiezan desplazamientoDatos bytes después.
    tablaEquipo: number;
    desplazamientoDatos: number;

    especie: number;
    apodoInicio: number;
    apodoFin: number;
    hpActual: number;
    statDataOffset: number;
    slotDataSize: number;
    statDataSize: number;
}

const DIRECCIONES: Record<VersionXY, DireccionesXY> = {
    "1.0": {
        medallas: 0x8C6A6A0,
        tablaEquipo: 0x8CE1C5C,
        desplazamientoDatos: 64,
        especie: 0x8,
        apodoInicio: 0x40,
        apodoFin: 0x58,
        hpActual: 0xF0,
        statDataOffset: 112,
        slotDataSize: 232,
        statDataSize: 22,
    },
    // Sin verificar en 1.1: la tabla se localizó midiendo sobre 1.0.
    "1.1": {
        medallas: 0x8C6A6B0,
        tablaEquipo: 0x8CE1C5C,
        desplazamientoDatos: 64,
        especie: 0x8,
        apodoInicio: 0x40,
        apodoFin: 0x58,
        hpActual: 0xF0,
        statDataOffset: 112,
        slotDataSize: 232,
        statDataSize: 22,
    },
};

export function crearXY(version: VersionXY): GameModule {
    const direcciones = DIRECCIONES[version];

    return {
        nombre: "PokemonXY",
        leerMedallas: () => procesarMedallas(direcciones.medallas),
        leerPokemon: (slot) => procesarPokemon(slot, direcciones),
    };
}

export async function procesarMedallas(direccionMedallas: number): Promise<number | null> {
    const datos = await readMemory(direccionMedallas, 1);

    if (datos!=null){
        //console.log(datos.toString('hex'));
        // La dirección de las medallas devuelve una máscara pero realemnte
        // en el juego para conseguir una medalla debes obtener la anterior
        // por lo que en vez de leer la máscara simplemente contamos la longitud 
        // de la cadena, los primeros 0 se omiten.
        const mascaraBinaria = parseInt(datos.toString('hex'), 16).toString(2);
        if(mascaraBinaria === '0'){
            return 0;
        }
        else {
            return mascaraBinaria.length;
        }
    }
    else{
        //console.log("error al procesar medallas");
        return null;
    }
}

// Devuelve null tanto si falla la lectura de memoria como si el slot está vacío.
async function procesarPokemon(slot: number, direcciones: DireccionesXY): Promise<PokemonLeido | null> {
    // Primero el puntero de la tabla de orden; sin esto leeríamos el pool en
    // bruto y el equipo saldría desordenado.
    const puntero = await readMemory(direcciones.tablaEquipo + slot * 4, 4);

    if (puntero === null) {
        return null;
    }

    const entrada = puntero.readUInt32LE(0);

    if (entrada === 0) {
        return null;
    }

    // Los huecos vacíos conservan el puntero de su antiguo ocupante, así que un
    // puntero no nulo no garantiza que haya Pokémon: eso lo decide más abajo
    // decryptPokemonData, que devuelve null si la entrada está liberada.
    const direccionSlot = entrada + direcciones.desplazamientoDatos;

    const partyData = await readMemory(direccionSlot, direcciones.slotDataSize);
    const statsData = await readMemory(direccionSlot + direcciones.slotDataSize + direcciones.statDataOffset, direcciones.statDataSize);

    if (partyData === null || statsData === null) {
        return null;
    }

    const datosCompletos = Buffer.concat([partyData, statsData]);
    const decrypted = decryptPokemonData(datosCompletos);

    if (decrypted === null) {
        return null; // slot vacío
    }

    return {
        pid: parsePid(decrypted),
        especie: parseSpeciesNumber(decrypted, direcciones),
        nombre: parseNickname(decrypted, direcciones),
        hp: parseHp(decrypted, direcciones),
    };
}

/**
 * PID de un Pokémon ya descifrado. Son los 4 primeros bytes de la cabecera, que
 * decryptPokemonData conserva sin tocar porque es la semilla del cifrado.
 */
export function parsePid(decrypted: Buffer): number {
    return decrypted.readUInt32LE(0);
}

/** Número de especie (dexNum) de un Pokémon ya descifrado. */
export function parseSpeciesNumber(decrypted: Buffer, direcciones: DireccionesXY): number {
    return decrypted.readUInt16LE(direcciones.especie);
}

/** Apodo/nombre de un Pokémon ya descifrado (texto UTF-16LE, terminado en byte nulo). */
export function parseNickname(decrypted: Buffer, direcciones: DireccionesXY): string {
    const raw = decrypted.toString('utf16le', direcciones.apodoInicio, direcciones.apodoFin);
    const nullIndex = raw.indexOf('\u0000');
    return nullIndex === -1 ? raw : raw.slice(0, nullIndex);
}

/**
 * HP actual de un Pokémon ya descifrado.
 * Solo están disponibles si se leyeron también los 22 bytes de "stats" (statDataOffset/
 * statDataSize) y se concatenaron antes de llamar a decryptPokemonData - si el buffer
 * descifrado no incluye esa parte, estos valores no tendrán sentido.
 */
export function parseHp(decrypted: Buffer, direcciones: DireccionesXY): { actual: number } {
    return {
        actual: decrypted.readUInt16LE(direcciones.hpActual),
    };
}