import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAsset } from 'node:sea';
import { EMPAQUETADO, rutaPlantillas } from './config/paths.js';

// Devuelve el HTML de una plantilla de overlay.
//
// En desarrollo se lee del disco en cada petición, así que los cambios se ven al
// refrescar la fuente sin recompilar. En el ejecutable van incrustadas como
// assets de Node SEA, porque junto a él no hay carpeta src/.
export function leerPlantilla(nombre: string): string {
    if (EMPAQUETADO) {
        return getAsset(nombre, 'utf8');
    }

    return readFileSync(path.join(rutaPlantillas(), nombre), 'utf-8');
}
