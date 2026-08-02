import WebSocket, { WebSocketServer } from 'ws';
import { procesarMedallas } from './azahar3ds/games/xy.js';
import { userConfig } from './config/userConfig/userConfig.js';

const WEBSOCKET_PORT = userConfig.websocket.port;

const wss = new WebSocketServer({
    port: WEBSOCKET_PORT
});

wss.on('connection', async function connection(ws) {
    ws.on('error', console.error);

    ws.on('message', function message(data) {
    console.log('received: %s', data);
    });


    const medallas = await procesarMedallas();

    if(medallas!=null){
         ws.send(medallas);
    }
});
