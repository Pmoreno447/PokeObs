import express from "express";
import type { Server } from 'node:http';
import { userConfig } from "./config/userConfig/userConfig.js";
import type { EstiloTexto } from "./config/userConfig/userConfig.js";
import { SLOTS_EQUIPO } from "./emulators/gameModule.js";
import { vidasRestantes } from "./contadorVidas.js";
import { leerPlantilla } from "./plantillas.js";

const TOTAL_MEDALLAS = 8;

// Rellena una plantilla HTML. El puerto del WebSocket va siempre porque el
// overlay se conecta desde el navegador de OBS, así que tiene que viajar dentro
// del propio HTML.
function renderizar(plantilla: string, sustituciones: Record<string, string>): string {
    const html = leerPlantilla(plantilla);

    return Object.entries({
        __PUERTO_WEBSOCKET__: String(userConfig.websocket.port),
        ...sustituciones,
    }).reduce(
        (texto, [marca, valor]) => texto.replaceAll(marca, valor),
        html
    );
}

// La fuente y el color acaban dentro de un bloque <style>, así que se quitan los
// caracteres que permitirían cerrar la regla y colar CSS arbitrario.
function limpiarCss(valor: string): string {
    return valor.replace(/[{}<>;\\]/g, '').trim();
}

// Traduce la configuración de tipografía a declaraciones CSS. Cada overlay de
// texto recibe las suyas, que se inyectan en la plantilla al servirla.
function estiloTexto(estilo: EstiloTexto): string {
    return [
        `font-family: ${limpiarCss(estilo.fuente) || 'sans-serif'};`,
        `font-weight: ${estilo.negrita ? 'bold' : 'normal'};`,
        `font-style: ${estilo.cursiva ? 'italic' : 'normal'};`,
        `color: ${limpiarCss(estilo.color) || '#ffffff'};`,
    ].join('\n            ');
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

        res.send(renderizar('pokemonNombre.html', {
            __SLOT__: String(slot),
            __ESTILO__: estiloTexto(userConfig.estilos.nombrePokemon),
        }));
    });

    // El contador en texto. Va sin número en la ruta porque no es una vida
    // concreta, sino cuántas quedan. Devuelve el número pelado: si alguien
    // quiere "3/15" o una etiqueta al lado, lo pone en la plantilla.
    app.get('/vidas', (_req, res) => {
        res.send(renderizar('vidasTexto.html', {
            __TEXTO_INICIAL__: String(vidasRestantes()),
            __ESTILO__: estiloTexto(userConfig.estilos.vidas),
        }));
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

    // Las imágenes las pone el usuario: la aplicación no distribuye ninguna. Se
    // esperan las subcarpetas medallas/, pokemon/ y vida/ dentro de la ruta
    // configurada.
    if (userConfig.rutaRecursos) {
        app.use('/img', express.static(userConfig.rutaRecursos));
        console.log(`[httpServer] Imágenes servidas desde ${userConfig.rutaRecursos}`);
    } else {
        console.warn('[httpServer] Sin carpeta de imágenes configurada: los overlays de imagen saldrán vacíos');
    }

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