import { randomBytes } from 'node:crypto';
import dgram from 'node:dgram';
import {AZAHAR_CURRENT_REQUEST_VERSION} from '../config/constants.js'
import { userConfig } from '../config/userConfig/userConfig.js'

const CITRA_PORT = userConfig.azahar3ds.citraPort;
const CITRA_IP = userConfig.azahar3ds.citraIp;

// Cabecera del datagrama (16 bytes) — protocolo de comunicación con el emulador Azahar (3DS)
//
//   offset:  0               4               8               12              16
//            +---------------+---------------+---------------+---------------+
//            |    version    |   requestId   |  requestType  |   dataSize    |
//            +---------------+---------------+---------------+---------------+
//               4 bytes         4 bytes          4 bytes         4 bytes
//
//   version     (0-4):  versión del protocolo
//   requestId   (4-8):  identificador único de la petición
//   requestType (8-12): tipo de operación solicitada
//   dataSize    (12-16): tamaño del payload que sigue a la cabecera
function generateHeader(requestType: number, dataSize: number): [Buffer, Buffer] {
    const requestId = randomBytes(4);

    // Reservamos 16 bytes
    const header = Buffer.alloc(16);
    
    // Escribimos en el buffer convirtiendo cada valor a 4 bytes (Unsigned Int)
    header.writeUInt32LE(AZAHAR_CURRENT_REQUEST_VERSION,0);
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

    if (AZAHAR_CURRENT_REQUEST_VERSION == replyVersion &&
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

export async function readMemory(address: number, dataSize: number): Promise<Buffer | null> {
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

        client.send(packet, CITRA_PORT, CITRA_IP);
    });
}


// CLIENTE UDP
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
