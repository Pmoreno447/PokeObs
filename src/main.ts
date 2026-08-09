import { iniciarOverlayServer } from './overlayServer.js';
import { iniciarHttpServer } from './httpServer.js';
import { listarJuegosSoportados } from './emulators/gameRegistry.js';

// Punto de entrada del backend. La GUI lo lanza como proceso hijo pasándole el
// juego elegido:
//
//   node dist/src/main.js PokemonXY-1.0
//   node dist/src/main.js --listar-juegos   (para poblar el desplegable)
//
// El resto de ajustes (puertos, IP de Citra) se leen de userConfig.json, que la
// GUI escribe antes de arrancar el proceso.
async function main(): Promise<void> {
    const argumento = process.argv[2];

    if (argumento === '--listar-juegos') {
        console.log(JSON.stringify(listarJuegosSoportados()));
        return;
    }

    if (!argumento) {
        throw new Error(
            `Falta el juego a ejecutar. Uso: node dist/src/main.js <juego>. ` +
            `Disponibles: ${listarJuegosSoportados().join(', ')}`
        );
    }

    // El orden importa: el overlayServer es quien selecciona el juego y abre el
    // WebSocket, y el HTTP solo tiene sentido una vez ese está escuchando.
    await iniciarOverlayServer(argumento);
    await iniciarHttpServer();

    console.log('[main] PokeObs en marcha');
}

main().catch((error: unknown) => {
    console.error(`[main] Error al arrancar: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
});
