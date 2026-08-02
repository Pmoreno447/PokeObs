import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'userConfig.json');

interface Azahar3dsConfig {
    citraIp: string;
    citraPort: number;
}

interface WebsocketConfig {
    port: number;
}

interface UserConfigData {
    azahar3ds: Azahar3dsConfig;
    websocket: WebsocketConfig;
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

    get azahar3ds(): Azahar3dsConfig {
        return this.data.azahar3ds;
    }

    get websocket(): WebsocketConfig {
        return this.data.websocket;
    }
}

export const userConfig = UserConfig.getInstance();
