import express from "express";
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { userConfig } from "./config/userConfig/userConfig.js";
import { RUTA_RECURSOS } from "./config/paths.js";

const PLANTILLA_MEDALLAS = path.join(RUTA_RECURSOS, 'html', 'medallas.html');
const TOTAL_MEDALLAS = 8;

// Sirve los recursos HTML que se añaden como fuente de navegador en OBS.
export function iniciarHttpServer(): Promise<Server> {
    const app = express();
    const puerto = userConfig.httpServer.port;

    app.get('/medallas/:numero', (req, res) => {
        const numero = parseInt(req.params.numero);

        if (isNaN(numero) || numero < 1 || numero > TOTAL_MEDALLAS) {
            res.status(404).send("No existe esa medalla");
            return;
        }

        // El overlay se conecta al WebSocket desde el navegador de OBS, así que
        // el puerto configurado tiene que viajar dentro del propio HTML.
        const plantilla = fs.readFileSync(PLANTILLA_MEDALLAS, 'utf-8');
        const html = plantilla
            .replace(/__NUMERO_MEDALLA__/g, String(numero))
            .replace(/__PUERTO_WEBSOCKET__/g, String(userConfig.websocket.port));

        res.send(html);
    });

    app.use('/img', express.static(path.join(RUTA_RECURSOS, 'img')));

    return new Promise((resolve, reject) => {
        const servidor = app.listen(puerto, () => {
            console.log(`[httpServer] Escuchando en http://localhost:${puerto}`);
            resolve(servidor);
        });

        servidor.once('error', reject);
    });
}
