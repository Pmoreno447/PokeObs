import { userConfig } from './config/userConfig/userConfig.js';
import type { PokemonLeido } from './emulators/gameModule.js';

// Contador de vidas al estilo Nuzlocke. No sabe nada de juegos: se limita a
// mirar el equipo que ya se está leyendo para el overlay y a restar una vida
// cada vez que un Pokémon cae. Cualquier juego que sepa rellenar PokemonLeido
// lo tiene gratis.

// Se arranca desde las que quedaban, no desde el total: la cuenta continúa
// donde la dejaste en la sesión anterior.
let vidas = userConfig.vidas.actuales;

// PS de la última vuelta, por PID. Hace falta para detectar el flanco: lo que
// resta una vida es el paso de "vivo" a "0 PS", no estar a 0. Sin esto, un
// Pokémon debilitado en el equipo restaría una vida por segundo.
const psAnteriores = new Map<number, number>();

export function vidasRestantes(): number {
    return vidas;
}

// Recibe el equipo tal cual se va a enviar al overlay.
export function registrarEquipo(equipo: (PokemonLeido | null)[]): void {
    equipo.forEach(pokemon => {
        if (pokemon === null) {
            return;
        }

        const anterior = psAnteriores.get(pokemon.pid);
        psAnteriores.set(pokemon.pid, pokemon.hp.actual);

        // La primera vez que vemos un Pokémon solo tomamos referencia: si al
        // arrancar ya venía debilitado, esa muerte no es de esta sesión.
        if (anterior === undefined) {
            return;
        }

        if (anterior > 0 && pokemon.hp.actual === 0) {
            vidas = Math.max(0, vidas - 1);

            // Se persiste en cada muerte y no al cerrar: son escrituras muy
            // esporádicas y así un cierre a lo bruto no se lleva la cuenta.
            userConfig.guardarVidasActuales(vidas);

            console.log(`[vidas] ${pokemon.nombre} ha caído. Vidas restantes: ${vidas}`);
        }
    });
}

// Vuelve al total configurado y olvida lo visto.
export function reiniciarVidas(): void {
    vidas = userConfig.vidas.iniciales;
    psAnteriores.clear();
    userConfig.guardarVidasActuales(vidas);
}