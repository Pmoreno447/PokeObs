import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isSea } from 'node:sea';
import { leerOpcion } from './argumentos.js';

// true cuando se ejecuta como aplicación empaquetada (un único ejecutable de
// Node SEA) y false en desarrollo, con node dist/src/main.js.
export const EMPAQUETADO = isSea();

// Raíz del proyecto en desarrollo. Solo se calcula fuera del ejecutable: dentro
// no hay proyecto, e import.meta ni siquiera existe en el código empaquetado.
//
// Este módulo compila a dist/src/config/paths.js, así que la raíz está tres
// niveles más arriba. Se parte de la ubicación del módulo y no de process.cwd()
// porque el proceso lo lanza la GUI y no podemos dar por hecho desde dónde.
function raizProyecto(): string {
    const aqui = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(aqui, '..', '..', '..');
}

// La GUI indica con --config dónde vive la configuración: en la carpeta de datos
// del usuario cuando está empaquetada. Sin argumento, en desarrollo, se usa la
// del propio proyecto.
export function rutaConfig(): string {
    const indicada = leerOpcion('config');

    if (indicada) {
        return indicada;
    }

    // Esto se evalúa al cargar la configuración, antes de que main() pueda
    // capturar nada, así que se sale con un mensaje claro en vez de una traza.
    if (EMPAQUETADO) {
        console.error('[config] Falta --config=<ruta de userConfig.json>. Abre PokeObs desde su aplicación.');
        process.exit(1);
    }

    return path.join(raizProyecto(), 'src', 'config', 'userConfig', 'userConfig.json');
}

// Solo en desarrollo: empaquetadas, las plantillas van dentro del ejecutable.
export function rutaPlantillas(): string {
    return path.join(raizProyecto(), 'src', 'resources', 'html');
}
