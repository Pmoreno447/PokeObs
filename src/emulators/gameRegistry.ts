//import de todos los juegos
import { crearXY } from "./azahar3ds/games/xy.js";
import { GameModule } from "./gameModule.js";

let juegoActivo: GameModule | null = null;

//Agrupamos todos los juegos disponibles con su identificador
const juegosSoportados: Record<string, GameModule> = {
    "PokemonXY-1.0": crearXY("1.0"),
    "PokemonXY-1.1": crearXY("1.1")
}

//Devuelve los identificadores de juego que la GUI puede ofrecer
export function listarJuegosSoportados(): string[] {
    return Object.keys(juegosSoportados);
}

//Función que establece el juego seleccionado
export function seleccionarJuego(nombre: string): void {
    const juego = juegosSoportados[nombre];

    if (!juego) {
        throw new Error(
            `Juego no soportado: "${nombre}". Disponibles: ${listarJuegosSoportados().join(', ')}`
        );
    }

    juegoActivo = juego;
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