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

const client = dgram.createSocket('udp4');

client.on('message', (msg, rinfo) => {
    if(rinfo.port == CITRA_PORT){
        console.log("Citra ha recibido el mensaje, " + msg.toString('hex'));
    }
    else {
        console.log("nigga wtf");
    }
})

const requestData = Buffer.alloc(8);
requestData.writeUInt32LE(0x100000, 0); // dirección de prueba
requestData.writeUInt32LE(4, 4);        // tamaño a leer

const [header, requestId] = generateHeader(1, requestData.length);
const packet = Buffer.concat([header, requestData]);

client.send(packet, CITRA_PORT, '127.0.0.1');

