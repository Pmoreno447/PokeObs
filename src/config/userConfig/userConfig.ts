import { readFileSync, writeFileSync } from 'node:fs';
import { RUTA_CONFIG as CONFIG_PATH } from '../paths.js';

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
        const raw = readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw) as UserConfigData;
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
