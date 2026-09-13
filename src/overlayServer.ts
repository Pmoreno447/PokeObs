import WebSocket, { WebSocketServer } from 'ws';
import { userConfig } from './config/userConfig/userConfig.js';
import { seleccionarJuego, leerMedallas, leerPokemon, obtenerCapacidades } from './emulators/gameRegistry.js';
import { SLOTS_EQUIPO } from './emulators/gameModule.js';
import { registrarEquipo, vidasRestantes } from './contadorVidas.js';

const INTERVALO_ACTUALIZACION_MS = 1000;

// Arranca el servidor WebSocket que alimenta el overlay con los datos del juego
// indicado. La promesa se resuelve cuando el puerto ya está escuchando, para
// poder encadenar después el arranque del servidor HTTP.
export function iniciarOverlayServer(juego: string): Promise<WebSocketServer> {
    seleccionarJuego(juego);

    const puerto = userConfig.websocket.port;
    const wss = new WebSocketServer({ port: puerto });

    wss.on('connection', function connection(ws) {
        ws.on('error', console.error);

        ws.on('message', function message(data) {
            console.log('received: %s', data);
        });
    });

    return new Promise((resolve, reject) => {
        wss.once('listening', () => {
            console.log(`[overlayServer] WebSocket escuchando en el puerto ${puerto} (juego: ${juego})`);
            programarActualizaciones(wss);
            resolve(wss);
        });

        wss.once('error', reject);
    });
}

// Solo se crean los temporizadores de lo que el juego activo sabe leer: si un
// módulo no implementa leerPokemon, no tiene sentido preguntar cada segundo por
// un equipo que siempre va a venir vacío.
function programarActualizaciones(wss: WebSocketServer): void {
    const capacidades = obtenerCapacidades();
    console.log(`[overlayServer] Capacidades del juego: ${capacidades.join(', ') || 'ninguna'}`);

    if (capacidades.includes('leerMedallas')) {
        setInterval(() => actualizarMedallas(wss), INTERVALO_ACTUALIZACION_MS);
    }

    if (capacidades.includes('leerPokemon')) {
        setInterval(() => actualizarEquipo(wss), INTERVALO_ACTUALIZACION_MS);
    }
}

// Todos los overlays comparten el mismo socket, así que cada mensaje lleva un
// "tipo" y cada cliente se queda con el suyo.
function emitir(wss: WebSocketServer, mensaje: object): void {
    const datos = JSON.stringify(mensaje);

    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(datos);
        }
    });
}

async function actualizarMedallas(wss: WebSocketServer): Promise<void> {
    const medallas = await leerMedallas();

    if (medallas !== null) {
        emitir(wss, { tipo: 'medallas', medallas: medallas });
    }
}

// El equipo son dos lecturas de memoria por slot, doce por vuelta. Si el
// emulador no responde, readMemory se queda esperando para siempre, así que sin
// este cerrojo cada segundo dejaríamos otra tanda de peticiones colgadas.
let equipoEnCurso = false;

async function actualizarEquipo(wss: WebSocketServer): Promise<void> {
    if (equipoEnCurso) {
        return;
    }

    equipoEnCurso = true;

    try {
        const lecturas = Array.from({ length: SLOTS_EQUIPO }, (_, slot) => leerPokemon(slot));
        const equipo = await Promise.all(lecturas);

        // Un equipo entero a null significa que no hemos podido leer nada; los
        // huecos sueltos sí son información (slots vacíos) y se envían.
        if (equipo.some(pokemon => pokemon !== null)) {
            // El contador se alimenta de la misma lectura, antes de enviarla:
            // ni hace peticiones extra ni depende de que haya nadie mirando el
            // overlay del equipo.
            registrarEquipo(equipo);

            emitir(wss, { tipo: 'equipo', equipo: equipo });
            emitir(wss, { tipo: 'vidas', vidas: vidasRestantes() });
        }
    } finally {
        equipoEnCurso = false;
    }
}