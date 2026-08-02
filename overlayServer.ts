import { setTimeout } from 'node:timers/promises';
import WebSocket, { WebSocketServer } from 'ws';
import { procesarMedallas } from './azaharConnection.js';

const wss = new WebSocketServer({
    port: 8080
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

    await setTimeout(10000);

    ws.send('xd');
});
