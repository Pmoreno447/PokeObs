import { randomBytes } from 'node:crypto';
import dgram from 'node:dgram';

const CURRENT_REQUEST_VERSION = 1
const CITRA_PORT = 45987

// Send a UDP message
function sendUdp(): void {
    const message = Buffer.from('Some bytes');
    const client = dgram.createSocket('udp4');
    client.send(message, 41234, 'localhost', (err) => {
    client.close();
    });
}

// 0-4: version, 4-8: requestId, 8-12: requestType, 12-16: dataSize.
function generateHeader(requestType: number, dataSize: number): [Buffer, Buffer] {
    const requestId = randomBytes(4);

    // Reservamos 16 bytes
    const header = Buffer.alloc(16);
    
    // Escribimos en el buffer convirtiendo cada valor a 4 bytes (Unsigned Int)
    header.writeUInt32LE(CURRENT_REQUEST_VERSION,0);
    requestId.copy(header, 4);
    header.writeUInt32LE(requestType, 8);  
    header.writeUInt32LE(dataSize, 12); 

    return [header, requestId];
}

function validateHeader(rawReply: Buffer, expectedType: number, expectedId: Buffer): Buffer | null{
    const replyVersion = rawReply.readUInt32LE(0);
    const replyId = rawReply.subarray(4, 8);
    const replyType = rawReply.readUInt32LE(8);
    const replyDataSize = rawReply.readUInt32LE(12);

    if (CURRENT_REQUEST_VERSION == replyVersion &&
            expectedId.equals(replyId) &&
            replyType == expectedType &&
            replyDataSize == rawReply.byteLength - 16) {
        
        // Devolvemos solo los datos, descartamos todo lo relativo al header de Citra(Azahar)
        return rawReply.subarray(16);
    }
    else{
        return null;
    }
}

async function readMemory(address: number, dataSize: number): Promise<Buffer | null> {
    // En caso de que pidamos más de 1KB necesitamos un bucle para procesar chunks

    // Creamos una promesa que será resuelta.
    return new Promise((resolve, reject) => {
        // Reservamos espacio para el payload de nuestra petición
        const requestData = Buffer.alloc(8);

        //Indicamos dirección y tamaño
        requestData.writeUInt32LE(address);
        requestData.writeUInt32LE(dataSize, 4);

        const [header, requestId] = generateHeader(1, requestData.length);
        const packet = Buffer.concat([header, requestData]);

        // Introducimos la promesa en el map, con su id.
        myMap.set(requestId.toString('hex'), resolve);

        client.send(packet, CITRA_PORT, '127.0.0.1');
    });
}

const client = dgram.createSocket('udp4');

let myMap = new Map<string, Function>();

client.on('message', (msg, rinfo) => {
    // Cuando recibimos un mensaje resolvemos la promesa.
    const requestId = msg.subarray(4, 8).toString('hex');
    const resolve = myMap.get(requestId.toString());

    // Le entregamos los datos a quien corresponda.
    if(resolve!=null){
        myMap.delete(requestId.toString());
        resolve(validateHeader(msg, 1, msg.subarray(4, 8)));
    }
    else{
        console.log("Error al resolver mensaje recibido");
    }
})

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

//procesarMedallas();