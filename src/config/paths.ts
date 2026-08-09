import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Este módulo compila a dist/src/config/paths.js, así que subiendo tres niveles
// llegamos a la raíz del proyecto. Se calcula a partir de la ubicación del
// módulo y no de process.cwd() porque el proceso lo lanza la GUI y no podemos
// dar por hecho desde qué directorio.
export const RAIZ_PROYECTO = path.resolve(__dirname, '..', '..', '..');

// La configuración de usuario y los recursos (html/imágenes) viven en src/ y no
// se compilan: son la única copia, tanto para la GUI que los edita como para el
// servidor que los lee.
export const RUTA_CONFIG = path.join(RAIZ_PROYECTO, 'src', 'config', 'userConfig', 'userConfig.json');
export const RUTA_RECURSOS = path.join(RAIZ_PROYECTO, 'src', 'resources');
