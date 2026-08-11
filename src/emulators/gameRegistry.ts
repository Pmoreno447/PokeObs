//import de todos los juegos
import { crearXY } from "./azahar3ds/games/xy.js";
import { GameModule, PokemonLeido, SLOTS_EQUIPO } from "./gameModule.js";

let juegoActivo: GameModule | null = null;

//Agrupamos todos los juegos disponibles con su identificador. Se guardan
//fábricas y no instancias: así solo se construye el módulo del juego elegido y
//no los de todos los emuladores soportados.
const juegosSoportados: Record<string, () => GameModule> = {
    "PokemonXY-1.0": () => crearXY("1.0"),
    "PokemonXY-1.1": () => crearXY("1.1")
}

//Devuelve los identificadores de juego que la GUI puede ofrecer
export function listarJuegosSoportados(): string[] {
    return Object.keys(juegosSoportados);
}

//Función que establece el juego seleccionado
export function seleccionarJuego(nombre: string): void {
    const crearJuego = juegosSoportados[nombre];

    if (!crearJuego) {
        throw new Error(
            `Juego no soportado: "${nombre}". Disponibles: ${listarJuegosSoportados().join(', ')}`
        );
    }

    juegoActivo = crearJuego();
}

//Comprueba cuales son las funcionalidades disponibles
export function obtenerCapacidades(): string[] {
    if (!juegoActivo) return [];

    return Object.keys(juegoActivo)
        .filter(clave => typeof juegoActivo![clave as keyof GameModule] === 'function');
}

export async function leerMedallas(): Promise<null|number> {
    if(juegoActivo?.leerMedallas){
        return await juegoActivo.leerMedallas();
    }
    else{
        return null;
    }
}

//Lee un Pokémon del equipo por su posición (0-5)
export async function leerPokemon(slot: number): Promise<null|PokemonLeido> {
    if(juegoActivo?.leerPokemon && slot >= 0 && slot < SLOTS_EQUIPO){
        return await juegoActivo.leerPokemon(slot);
    }
    else{
        return null;
    }
}