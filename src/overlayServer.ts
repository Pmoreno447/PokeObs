import WebSocket, { WebSocketServer } from 'ws';
import { userConfig } from './config/userConfig/userConfig.js';
import { seleccionarJuego, leerMedallas } from './emulators/gameRegistry.js';

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
            setInterval(() => actualizarMedallas(wss), INTERVALO_ACTUALIZACION_MS);
            resolve(wss);
        });

        wss.once('error', reject);
    });
}

async function actualizarMedallas(wss: WebSocketServer): Promise<void> {
    const medallas = await leerMedallas();

    if (medallas !== null) {
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ medallas: medallas }));
            }
        });
    }
}
