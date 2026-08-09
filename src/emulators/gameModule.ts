// Este es el contrato que usará cada módulo de cada juego, el objetivo es hacer que 
// la GUI pueda beber de una interfaz común, independientemente del juego que se esté 
// ejecutando

export interface GameModule {
    nombre: string;
    leerMedallas?: () => Promise<number | null>;
    leerPokemon?: () => Promise<string | null>;
}