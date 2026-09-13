import { readFileSync, writeFileSync } from 'node:fs';
import { RUTA_CONFIG as CONFIG_PATH } from '../paths.js';

interface Azahar3dsConfig {
    citraIp: string;
    citraPort: number;
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

interface UserConfigData {
    vidas: VidasConfig;
    azahar3ds: Azahar3dsConfig;
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

    get vidas(): VidasConfig {
        return this.data.vidas;
    }

    // Único dato que escribe el backend: el resto de la configuración la
    // gestiona la GUI mientras el servidor está parado.
    guardarVidasActuales(valor: number): void {
        this.data.vidas.actuales = valor;
        this.save();
    }

    get azahar3ds(): Azahar3dsConfig {
        return this.data.azahar3ds;
    }

    get websocket(): WebsocketConfig {
        return this.data.websocket;
    }

    get httpServer(): HttpServerConfig{
        return this.data.httpServer;
    }
}

export const userConfig = UserConfig.getInstance();
