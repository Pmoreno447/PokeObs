import express from "express";
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { userConfig } from "./config/userConfig/userConfig.js";
import { RUTA_RECURSOS } from "./config/paths.js";
import { SLOTS_EQUIPO } from "./emulators/gameModule.js";
import { vidasRestantes } from "./contadorVidas.js";

const RUTA_PLANTILLAS = path.join(RUTA_RECURSOS, 'html');
const TOTAL_MEDALLAS = 8;

// Rellena una plantilla HTML. El puerto del WebSocket va siempre porque el
// overlay se conecta desde el navegador de OBS, así que tiene que viajar dentro
// del propio HTML.
function renderizar(plantilla: string, sustituciones: Record<string, string>): string {
    const html = fs.readFileSync(path.join(RUTA_PLANTILLAS, plantilla), 'utf-8');

    return Object.entries({
        __PUERTO_WEBSOCKET__: String(userConfig.websocket.port),
        ...sustituciones,
    }).reduce(
        (texto, [marca, valor]) => texto.replaceAll(marca, valor),
        html
    );
}

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

        res.send(renderizar('medallas.html', { __NUMERO_MEDALLA__: String(numero) }));
    });

    // Los slots se exponen de 1 a 6 (como las medallas), aunque por dentro el
    // equipo sea un array indexado desde 0.
    app.get('/pokemon/:slot/imagen', (req, res) => {
        const slot = parseSlot(req.params.slot);

        if (slot === null) {
            res.status(404).send("No existe ese hueco del equipo");
            return;
        }

        res.send(renderizar('pokemonImagen.html', { __SLOT__: String(slot) }));
    });

    app.get('/pokemon/:slot/nombre', (req, res) => {
        const slot = parseSlot(req.params.slot);

        if (slot === null) {
            res.status(404).send("No existe ese hueco del equipo");
            return;
        }

        res.send(renderizar('pokemonNombre.html', { __SLOT__: String(slot) }));
    });

    // Una vida por recurso, igual que las medallas, para poder colocarlas en la
    // escena de OBS como quiera cada uno. El máximo lo pone la configuración.
    app.get('/vidas/:numero', (req, res) => {
        const numero = parseInt(req.params.numero);
        const total = userConfig.vidas.iniciales;

        if (isNaN(numero) || numero < 1 || numero > total) {
            res.status(404).send(`No existe esa vida (hay ${total} configuradas)`);
            return;
        }

        // El estado inicial se pinta ya en el HTML: si no, al recargar la fuente
        // en mitad de una partida saldría en color hasta el primer mensaje.
        res.send(renderizar('vidas.html', {
            __NUMERO_VIDA__: String(numero),
            __CLASE_INICIAL__: numero > vidasRestantes() ? 'perdida' : '',
        }));
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

// Convierte el slot de la URL (1-6) al índice del array del equipo (0-5).
function parseSlot(valor: string): number | null {
    const slot = parseInt(valor);

    if (isNaN(slot) || slot < 1 || slot > SLOTS_EQUIPO) {
        return null;
    }

    return slot - 1;
}