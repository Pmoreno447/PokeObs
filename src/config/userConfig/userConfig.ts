import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { rutaConfig } from '../paths.js';

const CONFIG_PATH = rutaConfig();

// Datos de conexión del emulador activo. Hay un único hueco a propósito: se
// configura "el emulador", no uno por marca, así que añadir soporte para otro no
// obliga a decidir de qué sección leer.
interface EmuladorConfig {
    ip: string;
    puerto: number;
}

interface WebsocketConfig {
    port: number;
}

interface HttpServerConfig {
    port: number;
}

interface VidasConfig {
    // Total configurado: de aquí sale cuántos recursos /vidas/N existen.
    iniciales: number;

    // Las que quedan ahora mismo. Lo escribe el backend en cada muerte para que
    // la cuenta sobreviva a cerrar la aplicación.
    actuales: number;
}

// Tipografía de un overlay de texto. Cada overlay lleva la suya: el nombre del
// Pokémon y el contador de vidas se configuran por separado.
export interface EstiloTexto {
    fuente: string;
    negrita: boolean;
    cursiva: boolean;
    color: string;
}

interface EstilosConfig {
    nombrePokemon: EstiloTexto;
    vidas: EstiloTexto;
}

interface UserConfigData {
    // Carpeta del usuario con sus imágenes: medallas/, pokemon/ y vida/. La
    // aplicación no distribuye ninguna, así que sin esto no hay imágenes.
    rutaRecursos: string;

    vidas: VidasConfig;
    estilos: EstilosConfig;
    emulador: EmuladorConfig;
    websocket: WebsocketConfig;
    httpServer: HttpServerConfig;
}

// Valores con los que se crea userConfig.json la primera vez. También rellenan
// las claves que falten en un fichero antiguo, para que añadir una opción nueva
// no rompa la configuración de quien ya tenía la aplicación.
const CONFIG_POR_DEFECTO: UserConfigData = {
    rutaRecursos: '',
    vidas: { iniciales: 3, actuales: 3 },
    emulador: { ip: '127.0.0.1', puerto: 45987 },
    websocket: { port: 8081 },
    httpServer: { port: 8082 },
    estilos: {
        nombrePokemon: { fuente: 'sans-serif', negrita: false, cursiva: false, color: '#ffffff' },
        vidas: { fuente: 'sans-serif', negrita: true, cursiva: false, color: '#ffffff' },
    },
};

// Completa en profundidad lo que falte en "leido" con lo que haya en "base".
function completarConPorDefecto<T>(base: T, leido: unknown): T {
    if (typeof base !== 'object' || base === null || Array.isArray(base)) {
        return (leido === undefined ? base : leido) as T;
    }

    const origen = (typeof leido === 'object' && leido !== null ? leido : {}) as Record<string, unknown>;
    const resultado: Record<string, unknown> = { ...origen };

    for (const [clave, valor] of Object.entries(base as Record<string, unknown>)) {
        resultado[clave] = completarConPorDefecto(valor, origen[clave]);
    }

    return resultado as T;
}

// Config editable por el usuario (persistida en userConfig.json). Se lee con
// fs en lugar de un import JSON estático para poder recargarla/guardarla en
// caliente cuando exista la interfaz de configuración.
class UserConfig {
    private static instance: UserConfig;
    private data: UserConfigData;

    private constructor() {
        this.data = this.readFromDisk();
    }

    static getInstance(): UserConfig {
        if (!UserConfig.instance) {
            UserConfig.instance = new UserConfig();
        }
        return UserConfig.instance;
    }

    private readFromDisk(): UserConfigData {
        // La primera vez que se abre la aplicación empaquetada no hay fichero en
        // la carpeta de datos del usuario: se crea con los valores por defecto.
        if (!existsSync(CONFIG_PATH)) {
            mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
            writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG_POR_DEFECTO, null, 2) + '\n');
        }

        const leido = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
        return completarConPorDefecto(CONFIG_POR_DEFECTO, leido);
    }

    // Descarta los cambios en memoria y vuelve a leer el fichero del disco.
    reload(): void {
        this.data = this.readFromDisk();
    }

    // Persiste el estado actual en userConfig.json.
    save(): void {
        writeFileSync(CONFIG_PATH, JSON.stringify(this.data, null, 2) + '\n');
    }

    get rutaRecursos(): string {
        return this.data.rutaRecursos;
    }

    get vidas(): VidasConfig {
        return this.data.vidas;
    }

    // Único dato que escribe el backend: el resto de la configuración la
    // gestiona la GUI mientras el servidor está parado.
    guardarVidasActuales(valor: number): void {
        this.data.vidas.actuales = valor;
        this.save();
    }

    get estilos(): EstilosConfig {
        return this.data.estilos;
    }

    get emulador(): EmuladorConfig {
        return this.data.emulador;
    }

    get websocket(): WebsocketConfig {
        return this.data.websocket;
    }

    get httpServer(): HttpServerConfig{
        return this.data.httpServer;
    }
}

export const userConfig = UserConfig.getInstance();
