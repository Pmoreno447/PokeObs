import { iniciarOverlayServer } from './overlayServer.js';
import { iniciarHttpServer } from './httpServer.js';
import { listarJuegosSoportados } from './emulators/gameRegistry.js';
import { descargarSprites } from './descargarSprites.js';
import { userConfig } from './config/userConfig/userConfig.js';
import { argumentosPosicionales, leerOpcion, tieneBandera } from './config/argumentos.js';

// Punto de entrada del backend. La GUI lo lanza como proceso hijo:
//
//   <backend> PokemonXY-1.0                      arranca los servidores
//   <backend> --listar-juegos                    juegos para el desplegable
//   <backend> --descargar-sprites [--destino=X]  iconos de PokeAPI en X/pokemon
//
// <backend> es "node dist/src/main.js" en desarrollo y el ejecutable en la
// aplicación empaquetada. En ambos casos se puede añadir --config=<ruta> para
// indicar dónde está userConfig.json; la GUI empaquetada siempre lo hace.
async function main(): Promise<void> {
    if (tieneBandera('listar-juegos')) {
        console.log(JSON.stringify(listarJuegosSoportados()));
        return;
    }

    if (tieneBandera('descargar-sprites')) {
        // La GUI pasa la carpeta con --destino para poder descargar sin obligar
        // antes a guardar; si no, se toma la ya configurada.
        const carpeta = leerOpcion('destino') || userConfig.rutaRecursos;

        if (!carpeta) {
            console.log('[sprites] No hay carpeta de imágenes configurada. Elígela en la GUI y vuelve a lanzarlo.');
            return;
        }

        await descargarSprites(carpeta);
        return;
    }

    const [juego] = argumentosPosicionales();

    if (!juego) {
        throw new Error(
            `Falta el juego a ejecutar. Disponibles: ${listarJuegosSoportados().join(', ')}`
        );
    }

    // El orden importa: el overlayServer es quien selecciona el juego y abre el
    // WebSocket, y el HTTP solo tiene sentido una vez ese está escuchando.
    await iniciarOverlayServer(juego);
    await iniciarHttpServer();

    console.log('[main] PokeObs en marcha');
}

main().catch((error: unknown) => {
    console.error(`[main] Error al arrancar: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
});
