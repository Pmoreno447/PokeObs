import { readMemory } from '../azaharConnection.js';
import { GameModule } from '../../gameModule.js';

export function crearXY(version: "1.0" | "1.1"): GameModule {
    const direccionMedallas = version === "1.0" ? 0x8C6A6A0 : 0x8C6A6B0;

    return {
        nombre: "PokemonXY",
        leerMedallas: () => procesarMedallas(direccionMedallas),
    };  
}

export async function procesarMedallas(direccionMedallas: number): Promise<number | null> {
    const datos = await readMemory(direccionMedallas, 1);

    if (datos!=null){
        //console.log(datos.toString('hex'));
        // La dirección de las medallas devuelve una máscara pero realemnte
        // en el juego para conseguir una medalla debes obtener la anterior
        // por lo que en vez de leer la máscara simplemente contamos la longitud 
        // de la cadena, los primeros 0 se omiten.
        const mascaraBinaria = parseInt(datos.toString('hex'), 16).toString(2);
        if(mascaraBinaria === '0'){
            return 0;
        }
        else {
            return mascaraBinaria.length;
        }
    }
    else{
        //console.log("error al procesar medallas");
        return null;
    }
}