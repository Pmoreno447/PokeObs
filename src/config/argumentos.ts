// Opciones de línea de comandos con la forma --nombre=valor.
//
// Se leen directamente de process.argv porque algunas, como --config, hacen falta
// antes de que main() llegue a ejecutarse: la configuración se carga al importar
// los módulos.
export function leerOpcion(nombre: string): string | undefined {
    const prefijo = `--${nombre}=`;
    return process.argv.find(argumento => argumento.startsWith(prefijo))?.slice(prefijo.length);
}

// Opciones sin valor, con la forma --nombre.
export function tieneBandera(nombre: string): boolean {
    return process.argv.includes(`--${nombre}`);
}

// Argumentos que no son opciones: el juego a ejecutar, por ejemplo.
export function argumentosPosicionales(): string[] {
    return process.argv.slice(2).filter(argumento => !argumento.startsWith('--'));
}
