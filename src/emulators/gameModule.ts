// Este es el contrato que usará cada módulo de cada juego, el objetivo es hacer que 
// la GUI pueda beber de una interfaz común, independientemente del juego que se esté 
// ejecutando

// Datos de un Pokémon del equipo ya interpretados, sin nada propio de un juego
// concreto: cada módulo los rellena leyendo de donde le toque. Van en crudo
// (número de especie, texto, números) para que sea quien los consume (overlay,
// HTML, GUI) el que decida cómo presentarlos.
// Tamaño máximo del equipo, igual en todos los juegos de la serie principal.
export const SLOTS_EQUIPO = 6;

export interface PokemonLeido {
    // Identificador único del Pokémon (PID). Es lo único estable: el hueco que
    // ocupa cambia al reordenar el equipo, el nombre puede repetirse y la
    // especie también.
    pid: number;

    especie: number;
    nombre: string;
    hp: { actual: number };
}

export interface GameModule {
    nombre: string;

    leerMedallas?: () => Promise<number | null>;

    // El slot es la posición en el equipo (0-5). Un mismo método sirve para los
    // seis: cada juego sabe calcular la dirección del slot que se le pida.
    leerPokemon?: (slot: number) => Promise<PokemonLeido | null>;
}