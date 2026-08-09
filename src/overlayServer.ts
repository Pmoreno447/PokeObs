import WebSocket, { WebSocketServer } from 'ws';
import { userConfig } from './config/userConfig/userConfig.js';
import { seleccionarJuego, leerMedallas } from './emulators/gameRegistry.js';

const WEBSOCKET_PORT = userConfig.websocket.port;

const wss = new WebSocketServer({
    port: WEBSOCKET_PORT
});

wss.on('connection', async function connection(ws) {
    ws.on('error', console.error);

    ws.on('message', function message(data) {
    console.log('received: %s', data);
    });

    seleccionarJuego("PokemonXY");

    const medallas = await leerMedallas();

    if(medallas!=null){
         ws.send(medallas);
    }
});
