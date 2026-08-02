import { readMemory } from '../azaharConnection.js';

export async function procesarMedallas(): Promise<number | null> {
    const datos = await readMemory(0x8C6A6A0, 1);

    if (datos!=null){
        //console.log(datos.toString('hex'));
        // La dirección de las medallas devuelve una máscara pero realemnte
        // en el juego para conseguir una medalla debes obtener la anterior
        // por lo que en vez de leer la máscara simplemente contamos la longitud 
        // de la cadena, los primeros 0 se omiten.
        const mascaraBinaria = parseInt(datos.toString('hex'), 16).toString(2);
        if(mascaraBinaria == '0'){
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